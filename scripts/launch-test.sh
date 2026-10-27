#!/usr/bin/env bash
# TEST DE PARCOURS COMPLET PRÉ-LANCEMENT — BILLOGRAPH
# Vendeur → produit numérique → achat → paiement (confirmOrderPayment, chemin réel)
# → livraison automatique (jeton) → commission → portefeuille → retrait → décision admin
# → notifications. Données de test supprimées à la fin (scripts/launch-test-purge.ts).
set -uo pipefail

BASE="http://localhost:3000"
JAR_V="/tmp/blg-test-vendor.txt"
JAR_A="/tmp/blg-test-admin.txt"
PDF="/tmp/blg-test-ebook.pdf"
TS=$(date +%s)
MARKER="Pre-Launch Test Ebook ${TS}"
SLUG="prelaunch-test-${TS}"
VENDOR_EMAIL="vendeur-test-${TS}@billograph.test"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (attendu: $2, obtenu: $1)"; fi }
contains(){ if echo "$1" | grep -q "$2"; then ok "$3"; else bad "$3 — '$2' absent dans: $(echo "$1" | head -c 300)"; fi }

echo "── 1. Préparation du fichier numérique réel (PDF)"
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%%%EOF\n' > "$PDF"
check "$(file -b "$PDF" | grep -c PDF)" "1" "PDF de test créé"

echo "── 2. Inscription vendeur (API réelle)"
R=$(curl -s -c "$JAR_V" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Vendeur Test Pre-Launch\",\"email\":\"${VENDOR_EMAIL}\",\"password\":\"TestVendeur!2026\"}")
contains "$R" '"role":"CLIENT"' "Compte créé (CLIENT — promu VENDEUR à la création de boutique)"

echo "── 3. Création de la boutique (API réelle)"
R=$(curl -s -b "$JAR_V" -c "$JAR_V" -X POST "$BASE/api/stores" -H "Content-Type: application/json" \
  -d "{\"name\":\"Boutique Test Pre-Launch\",\"slug\":\"$SLUG\",\"description\":\"Boutique du parcours de test pre-lancement\"}")
contains "$R" '"slug"' "Boutique créée"
R=$(curl -s -b "$JAR_V" "$BASE/api/auth/me")
contains "$R" '"role":"VENDEUR"' "Compte promu VENDEUR après création de boutique"

echo "── 4. Publication d'un produit numérique à 5 000 FCFA (API réelle, multipart)"
R=$(curl -s -b "$JAR_V" -X POST "$BASE/api/products" \
  -F "title=$MARKER" \
  -F "description=Ebook de test du parcours pre-lancement (paiement, livraison, commission, retrait)." \
  -F "type=DIGITAL" -F "category=ebook" -F "priceXOF=5000" -F "status=PUBLISHED" \
  -F "file=@$PDF;type=application/pdf")
contains "$R" '"hasFile":true' "Produit publié avec fichier numérique"
PRODUCT_SLUG=$(echo "$R" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  → produit: $PRODUCT_SLUG"

echo "── 5. Vérification checkout: sans clés FedaPay, la commande payée est refusée (422)"
R=$(curl -s -o /tmp/blg-t5.json -w "%{http_code}" -X POST "$BASE/api/orders" -H "Content-Type: application/json" \
  -d "{\"slug\":\"$PRODUCT_SLUG\",\"quantity\":1,\"customer\":{\"name\":\"Acheteur Test\",\"email\":\"acheteur@test-billograph.local\"},\"paymentMethod\":\"FEDAPAY\"}")
check "$R" "422" "Checkout protégé tant que les clés ne sont pas configurées (message: $(head -c 90 /tmp/blg-t5.json))"

echo "── 6. Commande payée via le chemin RÉEL (confirmOrderPayment — même code que webhook+polling)"
OUT=$(bun --conditions react-server scripts/launch-test-order.ts "$MARKER" 2>/dev/null | grep -v "^prisma:query")
echo "$OUT" | sed 's/^/  | /'
REF=$(echo "$OUT" | grep -o 'REF=BLG-[A-Z0-9]*' | cut -d= -f2)
[ -n "$REF" ] && ok "Référence de commande: $REF" || bad "Référence absente"
contains "$OUT" "order.status=PAID" "Commande passée en PAID"
contains "$OUT" "payment.status=SUCCESS" "Paiement marqué SUCCESS"
contains "$OUT" "downloadTokens=1" "Jeton de téléchargement généré automatiquement"
contains "$OUT" "vendorNotified=SALE" "Notification de vente créée pour le vendeur"
contains "$OUT" "commission 400" "Commission calculée à 8 % (400 FCFA sur 5 000)"

echo "── 7. Livraison automatique: téléchargement du fichier via le jeton"
TOKEN=$(bun --conditions react-server -e "
import { db } from './src/lib/db';
const t = await db.downloadToken.findFirst({ where: { order: { reference: '$REF' } } });
console.log(t?.token ?? '');
" 2>/dev/null | grep -v "^prisma:query" | tail -1)
check "$(curl -s -o /tmp/blg-dl.pdf -w "%{http_code}" "$BASE/api/downloads?token=$TOKEN")" "200" "GET /api/downloads?token → 200"
check "$(head -c 8 /tmp/blg-dl.pdf)" "%PDF-1.4" "Contenu téléchargé = vrai PDF"

echo "── 8. Portefeuille vendeur: solde = 4 600 FCFA (5 000 − 400 de commission)"
R=$(curl -s -b "$JAR_V" "$BASE/api/vendor/wallet")
contains "$R" '"availableXOF":4600' "Solde disponible = 4600 FCFA"
contains "$R" '"commissionXOF":400' "Commissions = 400 FCFA"

echo "── 9. Demandes de retrait: validations et garde-fous"
echo "  (attente de 65 s : le rate-limit anti-abus des retraits est 5/min/IP — fenêtre glissante)"
sleep 65
R=$(curl -s -o /tmp/blg-t9a.json -w "%{http_code}" -b "$JAR_V" -X POST "$BASE/api/vendor/withdrawals" -H "Content-Type: application/json" \
  -d '{"amountXOF":100000,"method":"MOBILE_MONEY","destination":"+2290197000000"}')
check "$R" "422" "Retrait supérieur au solde refusé"
R=$(curl -s -o /tmp/blg-t9b.json -w "%{http_code}" -b "$JAR_V" -X POST "$BASE/api/vendor/withdrawals" -H "Content-Type: application/json" \
  -d '{"amountXOF":1000,"method":"MOBILE_MONEY","destination":"+2290197000000"}')
check "$R" "422" "Retrait sous le minimum (2 000 FCFA) refusé"
R=$(curl -s -o /tmp/blg-t9c.json -w "%{http_code}" -b "$JAR_V" -X POST "$BASE/api/vendor/withdrawals" -H "Content-Type: application/json" \
  -d '{"amountXOF":4600,"method":"MOBILE_MONEY","destination":"+2290197000000"}')
check "$R" "201" "Retrait de 4600 FCFA accepté (PENDING — montant bloqué)"
W1=$(grep -o '"id":"[^"]*"' /tmp/blg-t9c.json | head -1 | cut -d'"' -f4)
R=$(curl -s -o /tmp/blg-t9d.json -w "%{http_code}" -b "$JAR_V" -X POST "$BASE/api/vendor/withdrawals" -H "Content-Type: application/json" \
  -d '{"amountXOF":4600,"method":"MOBILE_MONEY","destination":"+2290197000000"}')
check "$R" "422" "Second retrait du même solde refusé (anti double-dépense)"
R=$(curl -s -b "$JAR_V" "$BASE/api/vendor/wallet")
contains "$R" '"availableXOF":0' "Solde à 0 pendant le traitement du retrait"

echo "── 10. Connexion administrateur (chaîne complète: identifiants + 2 codes secrets)"
TOK=$(curl -s -c "$JAR_A" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"HJBILEDE@05\",\"password\":\"$OWNER_PASSWORD\"}" | grep -o '"challengeToken":"[^"]*"' | cut -d'"' -f4)
[ -n "$TOK" ] && ok "Challenge étape 1 émis" || bad "Challenge étape 1"
TOK=$(curl -s -c "$JAR_A" -b "$JAR_A" -X POST "$BASE/api/auth/admin-challenge" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOK\",\"code\":\"AM-Joyce\"}" | grep -o '"challengeToken":"[^"]*"' | cut -d'"' -f4)
[ -n "$TOK" ] && ok "Challenge étape 2 émis" || bad "Challenge étape 2"
R=$(curl -s -b "$JAR_A" -c "$JAR_A" -X POST "$BASE/api/auth/admin-challenge" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOK\",\"code\":\"GNAGUENON Monique\"}")
contains "$R" '"role":"ADMIN"' "Session ADMIN ouverte"

echo "── 11. Contrôle d'accès: un vendeur ne peut pas traiter les retraits"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_V" "$BASE/api/admin/withdrawals")
check "$R" "403" "API admin protégée contre un vendeur (403)"

echo "── 12. Décision admin: marquer versé exige la référence du transfert réel"
R=$(curl -s -o /tmp/blg-t12a.json -w "%{http_code}" -b "$JAR_A" -X POST "$BASE/api/admin/withdrawals/$W1" -H "Content-Type: application/json" \
  -d '{"action":"mark_paid"}')
check "$R" "422" "mark_paid sans référence refusé"
R=$(curl -s -o /tmp/blg-t12b.json -w "%{http_code}" -b "$JAR_A" -X POST "$BASE/api/admin/withdrawals/$W1" -H "Content-Type: application/json" \
  -d '{"action":"mark_paid","providerRef":"MP-TEST-260928-4600"}')
check "$R" "200" "mark_paid avec référence du transfert réel accepté"
contains "$(cat /tmp/blg-t12b.json)" '"status":"PAID"' "Retrait passé en PAID"

echo "── 13. Portefeuille après versement"
R=$(curl -s -b "$JAR_V" "$BASE/api/vendor/wallet")
contains "$R" '"paidOutXOF":4600' "paidOutXOF = 4600 FCFA (versement consigné)"
contains "$R" '"status":"PAID"' "Historique affiche le retrait versé"

echo "── 14. Chemin REJET: fonds libérés après refus motivé"
OUT=$(bun --conditions react-server scripts/launch-test-order.ts "$MARKER" 2>/dev/null | grep -v "^prisma:query")
REF2=$(echo "$OUT" | grep -o 'REF=BLG-[A-Z0-9]*' | cut -d= -f2)
R=$(curl -s -o /tmp/blg-t14a.json -w "%{http_code}" -b "$JAR_V" -X POST "$BASE/api/vendor/withdrawals" -H "Content-Type: application/json" \
  -d '{"amountXOF":4600,"method":"BANK_TRANSFER","destination":"BJ066 0100 0987 6543 2100 0000 00"}')
check "$R" "201" "Second retrait (virement) accepté"
W2=$(grep -o '"id":"[^"]*"' /tmp/blg-t14a.json | head -1 | cut -d'"' -f4)
R=$(curl -s -o /tmp/blg-t14b.json -w "%{http_code}" -b "$JAR_A" -X POST "$BASE/api/admin/withdrawals/$W2" -H "Content-Type: application/json" \
  -d '{"action":"reject"}')
check "$R" "422" "Rejet sans motif refusé"
R=$(curl -s -o /tmp/blg-t14c.json -w "%{http_code}" -b "$JAR_A" -X POST "$BASE/api/admin/withdrawals/$W2" -H "Content-Type: application/json" \
  -d '{"action":"reject","adminNote":"Coordonnées bancaires invalides"}')
check "$R" "200" "Rejet motivé accepté"
R=$(curl -s -b "$JAR_V" "$BASE/api/vendor/wallet")
contains "$R" '"availableXOF":4600' "Solde restauré à 4600 FCFA après rejet (fonds libérés)"

echo "── 15. Notifications vendeur et admin"
R=$(curl -s -b "$JAR_V" "$BASE/api/notifications")
UNREAD_V=$(echo "$R" | grep -o '"unreadCount":[0-9]*' | cut -d: -f2)
[ "${UNREAD_V:-0}" -ge 4 ] && ok "Vendeur: $UNREAD_V notifications non lues (ventes + retraits)" || bad "Vendeur: unreadCount=$UNREAD_V (attendu ≥ 4)"
contains "$R" "Retrait versé" "Notification de versement présente"
contains "$R" "Retrait refusé" "Notification de rejet présente"
R=$(curl -s -b "$JAR_A" "$BASE/api/notifications")
contains "$R" "Nouvelle demande de retrait" "Admin: demande de retrait notifiée"
R=$(curl -s -b "$JAR_V" -X POST "$BASE/api/notifications/read" -H "Content-Type: application/json" -d '{"all":true}')
contains "$R" '"ok":true' "Marquage tout lu OK"
R=$(curl -s -b "$JAR_V" "$BASE/api/notifications")
check "$(echo "$R" | grep -o '"unreadCount":[0-9]*' | cut -d: -f2)" "0" "unreadCount revenu à 0"

echo "── 16. Purge complète des données de test"
bun --conditions react-server scripts/launch-test-purge.ts 2>/dev/null | grep -v "^prisma:query" | sed 's/^/  | /'
R=$(bun --conditions react-server -e "import { db } from './src/lib/db'; const n = await db.user.count(); console.log(n);" 2>/dev/null | grep -v "^prisma:query" | tail -1)
check "$R" "1" "Base propre: seul le compte propriétaire subsiste"

echo ""
echo "════════════════════════════════════════"
echo "RÉSULTAT: $PASS réussis / $FAIL échoués"
[ "$FAIL" -eq 0 ] && echo "PARCOURS COMPLET VALIDÉ ✅" || echo "CORRIGER LES ÉCHECS AVANT LANCEMENT ❌"
