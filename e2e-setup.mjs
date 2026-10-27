// Setup E2E : compte vendeur de test + boutique + produit numérique gratuit
const BASE = "http://localhost:3000";
let cookie = "";
async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { ...(options.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}
const email = `e2e-vendor-${Date.now()}@test-billograph.com`;
console.log("1. Register:", email);
let r = await api("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Vendeur Test E2E", email, password: "TestE2E2026x" }) });
console.log("   →", r.status);
console.log("2. Create store");
r = await api("/api/stores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Boutique E2E", description: "Boutique de test E2E" }) });
console.log("   →", r.status, r.body?.store?.slug);
const storeSlug = r.body?.store?.slug;
console.log("3. Create digital product (gratuit, avec fichier)");
const form = new FormData();
form.set("title", "Guide E2E — Test livraison automatique");
form.set("description", "Produit de test E2E (numérique, gratuit).");
form.set("type", "DIGITAL");
form.set("category", "test");
form.set("priceXOF", "0");
form.set("status", "PUBLISHED");
const pdf = new Blob([Buffer.from("%PDF-1.4 Test E2E BILLOGRAPH — fichier de livraison automatique.")], { type: "application/pdf" });
form.set("file", pdf, "guide-e2e.pdf");
r = await api("/api/products", { method: "POST", body: form });
console.log("   →", r.status, r.body?.product?.slug);
console.log(JSON.stringify({ email, storeSlug, productSlug: r.body?.product?.slug }));
