import type { Metadata } from "next";
import { LabView } from "@/components/billograph/lab-view";

export const metadata: Metadata = {
  title: "Outils gratuits pour entrepreneurs | BILLOGRAPH LAB",
  description:
    "Calculez votre bénéfice, créez un CV professionnel, préparez un devis ou une facture et rédigez des contenus commerciaux avec les outils gratuits BILLOGRAPH LAB.",
  keywords: [
    "calculateur bénéfice FCFA",
    "créateur devis facture gratuit",
    "créateur CV gratuit",
    "outils entrepreneurs Bénin",
  ],
  alternates: { canonical: "/lab" },
};

export default function LabPage() {
  return <LabView />;
}
