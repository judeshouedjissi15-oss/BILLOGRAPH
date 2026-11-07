"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Printer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatXOF } from "@/lib/format";

type Tool = "profit" | "document" | "cv" | "content";
type LineItem = { description: string; quantity: string; unitPrice: string };

const EMPTY_LINE: LineItem = { description: "", quantity: "1", unitPrice: "" };

const CONTENT_TEMPLATES = [
  { title: "Lancement de produit", text: "Nouveau : [nom du produit].\\nPour [public cible], il aide à [bénéfice vérifiable].\\nDécouvrez les détails et le prix ici : [lien]." },
  { title: "Promotion", text: "Offre spéciale sur [nom du produit] : [prix ou réduction] jusqu'au [date].\\nProfitez-en ici : [lien]. Conditions : [conditions]." },
  { title: "Conseil éducatif", text: "Conseil pour [public cible] : [conseil concret].\\nAvec [nom du produit], vous pouvez approfondir [sujet réellement couvert].\\nEn savoir plus : [lien]." },
];

export function LabView() {
  const [tool, setTool] = useState<Tool>("profit");
  const [salePrice, setSalePrice] = useState("");
  const [cost, setCost] = useState("");
  const [feePercent, setFeePercent] = useState("10");
  const [documentTitle, setDocumentTitle] = useState("Devis");
  const [sellerName, setSellerName] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [cvName, setCvName] = useState("");
  const [cvContact, setCvContact] = useState("");
  const [cvRole, setCvRole] = useState("");
  const [cvExperience, setCvExperience] = useState("");
  const [cvEducation, setCvEducation] = useState("");
  const [contentTemplate, setContentTemplate] = useState(CONTENT_TEMPLATES[0].title);
  const [contentSubject, setContentSubject] = useState("");
  const [contentAudience, setContentAudience] = useState("");
  const [contentBenefit, setContentBenefit] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const sale = Number(salePrice) || 0;
  const expense = Number(cost) || 0;
  const fee = Math.min(100, Math.max(0, Number(feePercent) || 0));
  const net = Math.round(sale * (1 - fee / 100)) - expense;
  const margin = sale > 0 ? Math.round((net / sale) * 100) : 0;

  const documentTotal = useMemo(
    () => lineItems.reduce(
      (total, item) => total + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0),
      0,
    ),
    [lineItems],
  );

  const updateLine = (index: number, patch: Partial<LineItem>) => {
    setLineItems((items) => items.map((item, current) => current === index ? { ...item, ...patch } : item));
  };

  const generatedContent = useMemo(() => {
    const template = CONTENT_TEMPLATES.find((item) => item.title === contentTemplate);
    if (!template) return "";
    return template.text
      .replaceAll("[nom du produit]", contentSubject.trim() || "[nom du produit]")
      .replaceAll("[public cible]", contentAudience.trim() || "[public cible]")
      .replaceAll("[bénéfice vérifiable]", contentBenefit.trim() || "[bénéfice vérifiable]")
      .replaceAll("[sujet réellement couvert]", contentBenefit.trim() || "[sujet réellement couvert]");
  }, [contentAudience, contentBenefit, contentSubject, contentTemplate]);

  useEffect(() => {
    setContentDraft(generatedContent);
  }, [generatedContent]);

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(contentDraft);
      setCopyStatus("Brouillon copié.");
    } catch (error) {
      console.error("Impossible de copier le brouillon:", error);
      setCopyStatus("Copie impossible dans ce navigateur. Sélectionnez le texte pour le copier.");
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          .lab-printable, .lab-printable * { visibility: visible !important; }
          .lab-printable {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            padding: 24px !important;
            border: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">BILLOGRAPH LAB</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Des outils gratuits pour votre activité</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Calculez votre bénéfice, préparez un devis ou une facture imprimable, créez un CV et rédigez des contenus à partir de vos propres informations. Aucun compte n&apos;est nécessaire et les données restent dans votre navigateur.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Choisir un outil">
        {([
          ["profit", "Calculateur de bénéfices"],
          ["document", "Devis et facture"],
          ["cv", "Créateur de CV"],
          ["content", "Textes commerciaux"],
        ] as const).map(([id, title]) => (
          <Button
            key={id}
            type="button"
            aria-pressed={tool === id}
            variant={tool === id ? "default" : "outline"}
            className="h-auto min-h-11 justify-start whitespace-normal px-4 py-3 text-left"
            onClick={() => setTool(id)}
          >
            {title}
          </Button>
        ))}
      </div>

      {tool === "profit" && (
        <Card className="mt-6">
          <CardContent className="grid gap-8 p-5 sm:p-8 lg:grid-cols-2">
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Calculateur de bénéfices</h2>
                <p className="mt-1 text-sm text-muted-foreground">Estimez votre bénéfice après coûts et commission plateforme.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lab-sale-price">Prix de vente (FCFA)</Label>
                <Input id="lab-sale-price" type="number" min={0} step={1} value={salePrice} onChange={(event) => setSalePrice(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lab-cost">Coûts estimés (FCFA)</Label>
                <Input id="lab-cost" type="number" min={0} step={1} value={cost} onChange={(event) => setCost(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lab-fee">Commission plateforme (%)</Label>
                <Input id="lab-fee" type="number" min={0} max={100} step={1} value={feePercent} onChange={(event) => setFeePercent(event.target.value)} />
                <p className="text-xs text-muted-foreground">Saisissez le taux indiqué dans les réglages de votre plateforme ; le calcul est une estimation.</p>
              </div>
            </section>
            <section className="rounded-2xl bg-muted/60 p-5 sm:p-7" aria-live="polite">
              <h3 className="font-semibold">Estimation par vente</h3>
              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Prix de vente</dt><dd>{formatXOF(sale)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Commission estimée</dt><dd>{formatXOF(Math.round(sale * fee / 100))}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Coûts déclarés</dt><dd>{formatXOF(expense)}</dd></div>
                <div className="flex justify-between gap-4 border-t pt-4 text-base font-bold"><dt>Bénéfice estimé</dt><dd className={net < 0 ? "text-destructive" : "text-primary"}>{formatXOF(net)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Marge estimée</dt><dd>{sale > 0 ? `${margin}%` : "—"}</dd></div>
              </dl>
            </section>
          </CardContent>
        </Card>
      )}

      {tool === "document" && (
        <Card className="mt-6">
          <CardContent className="space-y-6 p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Créateur de devis et facture</h2>
                <p className="mt-1 text-sm text-muted-foreground">Les informations ne sont pas envoyées au serveur. Imprimez ou enregistrez le document en PDF.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => window.print()}><Printer className="mr-2 size-4" aria-hidden="true" /> Imprimer / PDF</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="lab-doc-type">Document</Label>
                <select id="lab-doc-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)}>
                  <option>Devis</option><option>Facture</option>
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="lab-seller">Votre nom / entreprise</Label><Input id="lab-seller" maxLength={100} value={sellerName} onChange={(event) => setSellerName(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="lab-buyer">Client</Label><Input id="lab-buyer" maxLength={100} value={buyerName} onChange={(event) => setBuyerName(event.target.value)} /></div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3"><h3 className="font-medium">Prestations ou articles</h3><Button type="button" variant="outline" size="sm" onClick={() => setLineItems((items) => [...items, { ...EMPTY_LINE }])}>Ajouter une ligne</Button></div>
              {lineItems.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_100px_150px_auto]">
                  <Input aria-label={`Description de la ligne ${index + 1}`} placeholder="Description" maxLength={160} value={item.description} onChange={(event) => updateLine(index, { description: event.target.value })} />
                  <Input aria-label={`Quantité de la ligne ${index + 1}`} type="number" min={0} step={1} placeholder="Quantité" value={item.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                  <Input aria-label={`Prix unitaire de la ligne ${index + 1}`} type="number" min={0} step={1} placeholder="Prix unitaire (FCFA)" value={item.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} />
                  <Button type="button" variant="ghost" disabled={lineItems.length === 1} aria-label={`Supprimer la ligne ${index + 1}`} onClick={() => setLineItems((items) => items.filter((_, current) => current !== index))}>×</Button>
                </div>
              ))}
            </div>
            <div className="lab-printable rounded-xl bg-muted/60 p-5">
              <div className="flex items-center justify-between gap-4 text-lg font-bold"><span>Total estimé</span><span>{formatXOF(documentTotal)}</span></div>
              <div className="mt-5 border-t pt-4">
                <p className="text-xl font-bold">{documentTitle}</p>
                <p className="mt-2 text-sm">{sellerName || "Votre nom / entreprise"} → {buyerName || "Nom du client"}</p>
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {lineItems.filter((item) => item.description.trim()).map((item, index) => (
                    <li key={index}>{item.description}: {item.quantity || 0} × {formatXOF(Number(item.unitPrice) || 0)}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Ce modèle ne remplace pas un document conforme à vos obligations fiscales locales. Complétez les mentions et numéros requis avant utilisation officielle.</p>
          </CardContent>
        </Card>
      )}

      {tool === "cv" && (
        <Card className="mt-6">
          <CardContent className="grid gap-8 p-5 sm:p-8 lg:grid-cols-2">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Créateur de CV professionnel</h2>
              <p className="text-sm text-muted-foreground">Rédigez une base de CV puis imprimez-la ou enregistrez-la en PDF.</p>
              <div className="space-y-2"><Label htmlFor="cv-name">Nom complet</Label><Input id="cv-name" maxLength={100} value={cvName} onChange={(event) => setCvName(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="cv-contact">Contact (téléphone, email, ville)</Label><Input id="cv-contact" maxLength={180} value={cvContact} onChange={(event) => setCvContact(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="cv-role">Poste recherché / profil</Label><Input id="cv-role" maxLength={160} value={cvRole} onChange={(event) => setCvRole(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="cv-experience">Expériences et compétences</Label><Textarea id="cv-experience" rows={5} maxLength={3000} value={cvExperience} onChange={(event) => setCvExperience(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="cv-education">Formation</Label><Textarea id="cv-education" rows={3} maxLength={1500} value={cvEducation} onChange={(event) => setCvEducation(event.target.value)} /></div>
              <Button type="button" variant="outline" onClick={() => window.print()}><Printer className="mr-2 size-4" aria-hidden="true" /> Imprimer / PDF</Button>
            </section>
            <article className="lab-printable min-h-96 rounded-xl border bg-background p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Curriculum vitae</p>
              <h3 className="mt-3 text-2xl font-bold">{cvName || "Votre nom"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{cvContact || "Coordonnées"}</p>
              <h4 className="mt-7 border-b pb-2 font-semibold">{cvRole || "Titre professionnel"}</h4>
              <p className="mt-3 whitespace-pre-line text-sm leading-6">{cvExperience || "Ajoutez vos expériences et compétences."}</p>
              <h4 className="mt-7 border-b pb-2 font-semibold">Formation</h4>
              <p className="mt-3 whitespace-pre-line text-sm leading-6">{cvEducation || "Ajoutez votre formation."}</p>
            </article>
          </CardContent>
        </Card>
      )}

      {tool === "content" && (
        <Card className="mt-6">
          <CardContent className="grid gap-8 p-5 sm:p-8 lg:grid-cols-2">
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Générateur de contenus commerciaux</h2>
                <p className="mt-1 text-sm text-muted-foreground">Créez un brouillon à partir de vos informations, sans génération automatique ni faits inventés.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content-template">Modèle</Label>
                <select id="content-template" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={contentTemplate} onChange={(event) => setContentTemplate(event.target.value)}>
                  {CONTENT_TEMPLATES.map((template) => <option key={template.title}>{template.title}</option>)}
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="content-product">Produit / sujet</Label><Input id="content-product" maxLength={120} value={contentSubject} onChange={(event) => setContentSubject(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="content-audience">Public cible</Label><Input id="content-audience" maxLength={120} value={contentAudience} onChange={(event) => setContentAudience(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="content-benefit">Bénéfice ou conseil vérifiable</Label><Textarea id="content-benefit" rows={3} maxLength={300} value={contentBenefit} onChange={(event) => setContentBenefit(event.target.value)} /></div>
            </section>
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><FileText className="size-4" aria-hidden="true" /> Brouillon modifiable</h3>
              <Textarea aria-label="Contenu généré" className="min-h-56" value={contentDraft} onChange={(event) => setContentDraft(event.target.value)} />
              <p className="text-xs text-muted-foreground">Vérifiez les informations, ajoutez votre lien et adaptez le texte avant de le publier.</p>
              <Button type="button" variant="outline" onClick={() => void copyDraft()}><Sparkles className="mr-2 size-4" aria-hidden="true" /> Copier le brouillon</Button>
              {copyStatus && <p role="status" className="text-xs text-muted-foreground">{copyStatus}</p>}
            </section>
          </CardContent>
        </Card>
      )}

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm text-muted-foreground">
        <span>Vos données d&apos;outils restent dans cette page et ne sont pas enregistrées.</span>
        <a href="/#/" className="inline-flex items-center gap-2 font-medium text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden="true" /> Retour à BILLOGRAPH</a>
      </footer>
    </main>
  );
}
