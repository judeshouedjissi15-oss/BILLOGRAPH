"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Loader2,
  Rocket,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { STORE_COLOR_PRESETS } from "../lib/store-colors";
import { navigateTo } from "../lib/use-hash-route";
import type { Store } from "@/types/api";
import type { SellerOnboardingResponses } from "@/lib/seller-onboarding";
import { cn } from "@/lib/utils";

const STEPS = [
  "Identité du vendeur",
  "Votre activité",
  "Produits et services",
  "Image de marque",
  "Clientèle et ventes",
  "Livraison et exécution",
  "Conditions commerciales",
  "Objectifs et récapitulatif",
] as const;

const BUSINESS_CATEGORIES = [
  "Formation et éducation", "Informatique et technologie", "Marketing digital",
  "Génie civil et BTP", "Mode et beauté", "Littérature et édition",
  "Musique et divertissement", "Commerce général", "Services professionnels", "Autres",
];
const DIGITAL_OPTIONS = [
  "Ebooks et PDF", "Formations", "Vidéos", "Musiques", "Logiciels et APK",
  "Templates", "Documents professionnels", "Autres fichiers numériques",
];
const PHYSICAL_OPTIONS = [
  "Vêtements", "Accessoires", "Équipements", "Produits alimentaires",
  "Matériel informatique", "Autres marchandises",
];
const SERVICE_OPTIONS = [
  "Consultations", "Formations en direct", "Prestations numériques",
  "Services professionnels", "Accompagnement", "Autres prestations",
];
const NETWORK_OPTIONS = ["WhatsApp", "Facebook", "Instagram", "TikTok", "YouTube", "LinkedIn", "Telegram", "Autre"];
const FEATURE_OPTIONS = ["Boutique en ligne", "Paiements", "Téléchargements", "Affiliation", "Promotions", "Statistiques", "Livraison"];

type OnboardingProfile = {
  currentStep: number;
  completed: boolean;
  responses: SellerOnboardingResponses;
  user: { name: string; email: string; phone: string | null; city: string | null };
};
type TextKey =
  | "commercialName" | "phone" | "country" | "city" | "businessAddress"
  | "specialty" | "yearsActive" | "offering" | "mission" | "differentiator"
  | "commercialGoals" | "targetCustomer" | "mainProduct" | "offerAudience"
  | "offerValue" | "otherPlatforms" | "competitors" | "publicName" | "slogan" | "secondaryColor"
  | "shortDescription" | "fullPresentation" | "logoUrl" | "coverUrl" | "visualStyle"
  | "publicContact" | "website" | "socialLinks" | "targetAudience" | "customerAge"
  | "targetCountries" | "customerProblems" | "customerAcquisition" | "approximateFileSize"
  | "digitalDelivery" | "postPurchaseInstructions" | "shippingZones" | "shippingFees"
  | "shippingDelay" | "stockManagement" | "orderProcessing" | "serviceDelivery"
  | "serviceDelay" | "serviceInstructions" | "refundPolicy" | "salesConditions"
  | "productUsageTerms" | "customerInstructions" | "supportEmail" | "mainGoal"
  | "onlineSalesChallenges";
type NumberKey = "foundedYear" | "plannedProducts" | "averagePriceXOF" | "monthlySalesGoalXOF";
type ListKey = "categories" | "digitalProducts" | "physicalProducts" | "services" | "socialNetworks" | "digitalFormats" | "interestedFeatures";
type BooleanKey = "wantsAffiliates" | "needsAppointment" | "internationalSales" | "recruitAffiliates";

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

type StoreCreateFormProps = { onCreated: (store: Store) => void };

export function StoreCreateForm({ onCreated }: StoreCreateFormProps) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<SellerOnboardingResponses>({});
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<OnboardingProfile["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiFetch<OnboardingProfile>("/api/vendor/onboarding")
      .then((profile) => {
        if (!active) return;
        setAccount(profile.user);
        setAnswers({
          ...profile.responses,
          phone: profile.responses.phone ?? profile.user.phone ?? undefined,
          city: profile.responses.city ?? profile.user.city ?? undefined,
        });
        setStep(Math.min(7, Math.max(0, profile.currentStep)));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger votre brouillon.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const saveDraft = useCallback(async (
    nextStep = step,
    nextAnswers = answers,
  ) => {
    setSaving(true);
    try {
      await apiFetch("/api/vendor/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStep: nextStep, responses: nextAnswers }),
      });
      setLastSaved(new Date());
    } finally {
      setSaving(false);
    }
  }, [answers, step]);

  useEffect(() => {
    if (loading || error) return;
    const timer = window.setTimeout(() => {
      void saveDraft().catch((saveError) => {
        toast({
          variant: "destructive",
          title: "Sauvegarde automatique impossible",
          description: saveError instanceof Error ? saveError.message : "Réessayez.",
        });
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [answers, error, loading, saveDraft, step, toast]);

  const updateText = (key: TextKey, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };
  const updateNumber = (key: NumberKey, value: string) => {
    const number = value === "" ? undefined : Number(value);
    setAnswers((current) => ({ ...current, [key]: number }));
  };
  const updateBoolean = (key: BooleanKey, value: boolean) => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };
  const toggleOption = (key: ListKey, option: string, checked: boolean) => {
    setAnswers((current) => {
      const selected = current[key] ?? [];
      return {
        ...current,
        [key]: checked ? [...selected, option] : selected.filter((item) => item !== option),
      };
    });
  };

  const textField = (key: TextKey, label: string, placeholder?: string, type = "text") => (
    <div key={key} className="space-y-2">
      <Label htmlFor={`onboarding-${key}`}>{label}</Label>
      <Input
        id={`onboarding-${key}`}
        type={type}
        value={answers[key] ?? ""}
        placeholder={placeholder}
        onChange={(event) => updateText(key, event.target.value)}
        className="h-11"
      />
    </div>
  );
  const areaField = (key: TextKey, label: string, placeholder: string, rows = 3) => (
    <div key={key} className="space-y-2">
      <Label htmlFor={`onboarding-${key}`}>{label}</Label>
      <Textarea
        id={`onboarding-${key}`}
        value={answers[key] ?? ""}
        placeholder={placeholder}
        rows={rows}
        onChange={(event) => updateText(key, event.target.value)}
      />
    </div>
  );
  const numberField = (key: NumberKey, label: string, placeholder?: string) => (
    <div key={key} className="space-y-2">
      <Label htmlFor={`onboarding-${key}`}>{label}</Label>
      <Input
        id={`onboarding-${key}`}
        type="number"
        min={key === "foundedYear" ? 1800 : 0}
        step={1}
        value={answers[key] ?? ""}
        placeholder={placeholder}
        onChange={(event) => updateNumber(key, event.target.value)}
        className="h-11"
      />
    </div>
  );
  const selectField = (
    key: "sellerType" | "customerAge" | "visualStyle" | "yearsActive",
    label: string,
    options: Array<[string, string]>,
  ) => (
    <div key={key} className="space-y-2">
      <Label htmlFor={`onboarding-${key}`}>{label}</Label>
      <select
        id={`onboarding-${key}`}
        value={answers[key] ?? ""}
        onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}
        className="h-11 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">Sélectionner</option>
        {options.map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
      </select>
    </div>
  );
  const choiceGroup = (key: ListKey, label: string, options: string[]) => (
    <fieldset key={key}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = (answers[key] ?? []).includes(option);
          return (
            <label key={option} className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
              checked && "border-primary bg-primary/5 text-primary",
            )}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => toggleOption(key, option, event.target.checked)}
                className="size-4 accent-primary"
              />
              {option}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
  const booleanChoice = (key: BooleanKey, question: string) => (
    <fieldset key={key} className="space-y-2">
      <legend className="text-sm font-medium">{question}</legend>
      <div className="flex gap-2">
        {[["yes", "Oui"], ["no", "Non"]].map(([value, label]) => {
          const checked = answers[key] === (value === "yes");
          return (
            <button
              key={value}
              type="button"
              aria-pressed={checked}
              onClick={() => updateBoolean(key, value === "yes")}
              className={cn(
                "min-h-10 rounded-md border px-4 text-sm",
                checked && "border-primary bg-primary/5 text-primary",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  const stepContent: ReactNode[] = [
    <div className="grid gap-4 sm:grid-cols-2" key="identity">
      <div className="space-y-2">
        <Label>Nom et prénom du compte</Label>
        <Input value={account?.name ?? ""} readOnly aria-readonly="true" className="h-11 bg-muted" />
      </div>
      <div className="space-y-2">
        <Label>Email du compte</Label>
        <Input value={account?.email ?? ""} readOnly aria-readonly="true" className="h-11 bg-muted" />
      </div>
      {selectField("sellerType", "Type de vendeur", [
        ["individual", "Particulier"], ["entrepreneur", "Entrepreneur"], ["company", "Entreprise"],
        ["association", "Association"], ["organization", "Organisation"],
      ])}
      {textField("commercialName", "Nom commercial ou raison sociale *", "Ex. Atelier Kora")}
      {textField("phone", "Téléphone / WhatsApp", "+229 01 97 00 00 00", "tel")}
      {textField("country", "Pays", "Bénin")}
      {textField("city", "Ville", "Cotonou")}
      {textField("businessAddress", "Adresse professionnelle (facultatif)")}
      {numberField("foundedYear", "Année de création (facultatif)", "2020")}
    </div>,
    <div className="space-y-5" key="activity">
      {choiceGroup("categories", "Domaines d'activité (plusieurs choix possibles)", BUSINESS_CATEGORIES)}
      <div className="grid gap-4 sm:grid-cols-2">
        {textField("specialty", "Votre spécialité")}
        {selectField("yearsActive", "Depuis combien de temps exercez-vous ?", [
          ["less-1", "Moins d'un an"], ["1-3", "1 à 3 ans"], ["4-7", "4 à 7 ans"], ["8+", "Plus de 7 ans"],
        ])}
      </div>
      {areaField("offering", "Que proposez-vous à vos clients ?", "Décrivez votre activité et votre offre.")}
      <div className="grid gap-4 sm:grid-cols-2">
        {areaField("mission", "Mission de votre entreprise", "Quelle valeur souhaitez-vous apporter ?", 2)}
        {areaField("differentiator", "Ce qui vous distingue", "Votre savoir-faire, votre approche ou votre qualité.", 2)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {areaField("commercialGoals", "Objectifs commerciaux", "Quels résultats souhaitez-vous atteindre ?", 2)}
        {areaField("targetCustomer", "Clientèle souhaitée", "À qui souhaitez-vous vendre ?", 2)}
      </div>
    </div>,
    <div className="space-y-5" key="products">
      {choiceGroup("digitalProducts", "Produits numériques", DIGITAL_OPTIONS)}
      {choiceGroup("physicalProducts", "Produits physiques", PHYSICAL_OPTIONS)}
      {choiceGroup("services", "Services", SERVICE_OPTIONS)}
      <div className="grid gap-4 sm:grid-cols-2">
        {textField("mainProduct", "Produit ou service principal")}
        {numberField("plannedProducts", "Nombre de produits à publier", "10")}
        {numberField("averagePriceXOF", "Prix moyen envisagé (FCFA)", "10000")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {areaField("offerAudience", "À qui s'adressent vos offres ?", "Décrivez les clients concernés.", 2)}
        {areaField("offerValue", "Valeur ajoutée de votre offre", "Quel résultat ou bénéfice le client obtient-il ?", 2)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {textField("otherPlatforms", "Autres plateformes utilisées (facultatif)")}
        {textField("competitors", "Concurrents principaux (facultatif)")}
      </div>
    </div>,
    <div className="space-y-5" key="brand">
      <div className="grid gap-4 sm:grid-cols-2">
        {textField("publicName", "Nom public de la boutique *", "Le nom affiché aux clients")}
        {textField("slogan", "Slogan (facultatif)", "Une phrase qui résume votre marque")}
      </div>
      {areaField("shortDescription", "Description courte", "Présentez votre boutique en quelques mots.", 2)}
      {areaField("fullPresentation", "Présentation complète", "Votre histoire, votre mission, vos engagements.")}
      <div className="grid gap-4 sm:grid-cols-2">
        {textField("logoUrl", "Lien vers le logo (facultatif)", "https://…", "url")}
        {textField("coverUrl", "Lien vers l'image de couverture (facultatif)", "https://…", "url")}
        {textField("publicContact", "Coordonnées publiques de contact")}
        {textField("website", "Site internet (facultatif)", "https://…", "url")}
        {selectField("visualStyle", "Style visuel préféré", [
          ["modern", "Moderne"], ["minimal", "Minimaliste"], ["elegant", "Élégant"],
          ["bold", "Audacieux"], ["natural", "Naturel"],
        ])}
        {textField("socialLinks", "Réseaux sociaux (liens séparés par des virgules)")}
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Couleur principale</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {STORE_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              aria-pressed={(answers.primaryColor ?? STORE_COLOR_PRESETS[0].value) === preset.value}
              aria-label={`Couleur ${preset.label}`}
              onClick={() => setAnswers((current) => ({ ...current, primaryColor: preset.value }))}
              className={cn("flex size-11 items-center justify-center rounded-full ring-offset-2", (answers.primaryColor ?? STORE_COLOR_PRESETS[0].value) === preset.value && "ring-2 ring-ring")}
              style={{ backgroundColor: preset.value }}
            >
              {(answers.primaryColor ?? STORE_COLOR_PRESETS[0].value) === preset.value && <Check className="size-5 text-white" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        {textField("secondaryColor", "Couleur secondaire (facultatif)", "#F59E0B")}
      </div>
      <Card className="bg-muted/40">
        <CardHeader className="pb-2"><CardTitle className="text-base">Aperçu de la marque</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-xl border bg-background p-4" style={{ borderColor: answers.primaryColor ?? STORE_COLOR_PRESETS[0].value }}>
            <p className="font-semibold">{answers.publicName || "Nom de votre boutique"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{answers.slogan || answers.shortDescription || "Votre slogan et votre description apparaîtront ici."}</p>
          </div>
        </CardContent>
      </Card>
    </div>,
    <div className="space-y-5" key="marketing">
      <div className="grid gap-4 sm:grid-cols-2">
        {areaField("targetAudience", "Public cible", "Qui souhaitez-vous atteindre ?", 2)}
        {selectField("customerAge", "Âge habituel des clients", [
          ["under-18", "Moins de 18 ans"], ["18-24", "18 à 24 ans"], ["25-34", "25 à 34 ans"],
          ["35-49", "35 à 49 ans"], ["50+", "50 ans et plus"], ["all", "Tous les âges"],
        ])}
      </div>
      {textField("targetCountries", "Pays où vous souhaitez vendre", "Ex. Bénin, Togo, Côte d'Ivoire")}
      {areaField("customerProblems", "Quels problèmes vos offres résolvent-elles ?", "Expliquez le besoin auquel vous répondez.")}
      {choiceGroup("socialNetworks", "Réseaux sociaux utilisés", NETWORK_OPTIONS)}
      {areaField("customerAcquisition", "Comment trouvez-vous actuellement vos clients ?", "Ex. recommandations, réseaux sociaux…", 2)}
      {numberField("monthlySalesGoalXOF", "Objectif mensuel de ventes (FCFA)", "500000")}
      {booleanChoice("wantsAffiliates", "Souhaitez-vous utiliser des affiliés pour développer vos ventes ?")}
    </div>,
    <div className="space-y-5" key="fulfillment">
      {((answers.digitalProducts?.length ?? 0) > 0) && (
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Produits numériques</legend>
          {choiceGroup("digitalFormats", "Formats de fichiers", ["PDF", "ZIP", "MP4", "MP3", "APK", "Autres"])}
          {textField("approximateFileSize", "Taille approximative des fichiers", "Ex. 2 Go")}
          {areaField("digitalDelivery", "Mode de livraison numérique", "Téléchargement, accès, lien externe…", 2)}
          {areaField("postPurchaseInstructions", "Instructions après achat", "Que doit faire le client après le paiement ?", 2)}
        </fieldset>
      )}
      {((answers.physicalProducts?.length ?? 0) > 0) && (
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Produits physiques</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {textField("shippingZones", "Zones de livraison")}
            {textField("shippingFees", "Frais de livraison")}
            {textField("shippingDelay", "Délai de livraison")}
            {textField("stockManagement", "Gestion du stock")}
          </div>
          {areaField("orderProcessing", "Traitement des commandes", "Comment préparez-vous et expédiez-vous les commandes ?", 2)}
        </fieldset>
      )}
      {((answers.services?.length ?? 0) > 0) && (
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Services</legend>
          {areaField("serviceDelivery", "Modalités de prestation", "En ligne, sur place, par rendez-vous…", 2)}
          {textField("serviceDelay", "Délai d'exécution")}
          {booleanChoice("needsAppointment", "La prestation nécessite-t-elle un rendez-vous ?")}
          {areaField("serviceInstructions", "Instructions après paiement", "Comment le client accède-t-il à la prestation ?", 2)}
        </fieldset>
      )}
      {(answers.digitalProducts?.length || answers.physicalProducts?.length || answers.services?.length) ? null : (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Sélectionnez les types de produits ou de services à l&apos;étape précédente pour afficher les questions de livraison adaptées.
        </div>
      )}
    </div>,
    <div className="space-y-4" key="terms">
      <p className="text-sm text-muted-foreground">Ces informations sont facultatives. Elles pourront rassurer vos clients et seront modifiables ultérieurement.</p>
      {areaField("refundPolicy", "Politique de remboursement", "Décrivez clairement vos conditions.")}
      {areaField("salesConditions", "Conditions particulières de vente", "Conditions applicables à vos offres.")}
      {areaField("productUsageTerms", "Conditions d'utilisation des produits", "Droits d'utilisation et restrictions éventuelles.")}
      {areaField("customerInstructions", "Instructions destinées aux clients", "Informations utiles avant ou après achat.")}
      {textField("supportEmail", "Email de service après-vente", "support@exemple.com", "email")}
    </div>,
    <div className="space-y-5" key="goals">
      {areaField("mainGoal", "Votre objectif principal sur BILLOGRAPH", "Que souhaitez-vous accomplir en premier ?", 2)}
      <div className="grid gap-4 sm:grid-cols-2">
        {booleanChoice("internationalSales", "Souhaitez-vous développer une clientèle internationale ?")}
        {booleanChoice("recruitAffiliates", "Souhaitez-vous recruter des affiliés ?")}
      </div>
      {choiceGroup("interestedFeatures", "Fonctionnalités qui vous intéressent", FEATURE_OPTIONS)}
      {areaField("onlineSalesChallenges", "Difficultés actuelles dans la vente en ligne", "Cela nous aidera à mieux adapter votre espace.", 3)}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Récapitulatif de vos réponses</CardTitle>
          <CardDescription>Vous pourrez compléter et modifier votre profil vendeur après la création.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-80 space-y-3 overflow-y-auto">
          {Object.entries(answers).filter(([, value]) => value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0)).map(([key, value]) => (
            <div key={key} className="border-b pb-2 text-sm last:border-0">
              <p className="font-medium">{key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{Array.isArray(value) ? value.join(", ") : String(value)}</p>
            </div>
          ))}
          {Object.values(answers).every((value) => value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) && (
            <p className="text-sm text-muted-foreground">Aucune réponse complémentaire saisie pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </div>,
  ];

  const handleNext = async () => {
    if (step === 0 && (!answers.commercialName?.trim() || !answers.sellerType)) {
      toast({ variant: "destructive", title: "Informations requises", description: "Indiquez le nom commercial et le type de vendeur pour continuer." });
      return;
    }
    if (step === 3 && !answers.publicName?.trim()) {
      toast({ variant: "destructive", title: "Nom de boutique requis", description: "Indiquez le nom public qui sera visible par vos clients." });
      return;
    }
    try {
      await saveDraft(Math.min(7, step + 1), answers);
      setStep((current) => Math.min(7, current + 1));
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: "Sauvegarde impossible",
        description: saveError instanceof Error ? saveError.message : "Réessayez.",
      });
    }
  };

  const handleBack = () => setStep((current) => Math.max(0, current - 1));

  const handleSaveAndExit = async () => {
    try {
      await saveDraft();
      toast({ title: "Brouillon enregistré", description: "Vous pourrez reprendre la création de votre boutique depuis votre tableau de bord." });
      navigateTo("#/");
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: "Brouillon non enregistré",
        description: saveError instanceof Error ? saveError.message : "Réessayez.",
      });
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = answers.publicName?.trim() || answers.commercialName?.trim() || "";
    if (name.length < 2) {
      toast({ variant: "destructive", title: "Nom de boutique requis", description: "Complétez le nom public à l'étape Image de marque." });
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch<{ store: Store }>("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slug.trim() || undefined,
          description: (answers.fullPresentation?.trim() || answers.shortDescription?.trim() || answers.offering?.trim() || "").slice(0, 600) || undefined,
          color: answers.primaryColor ?? STORE_COLOR_PRESETS[0].value,
          phone: answers.phone?.trim() || undefined,
          deliveryInfo: (answers.digitalDelivery || answers.orderProcessing || answers.serviceDelivery || "").slice(0, 600) || undefined,
          returnPolicy: answers.refundPolicy?.slice(0, 600) || undefined,
          trustMessage: answers.slogan || undefined,
          onboardingResponses: answers,
        }),
      });
      toast({
        title: "Boutique créée !",
        description: `Votre boutique « ${data.store.name} » est prête. Votre profil vendeur a été enregistré.`,
      });
      onCreated(data.store);
    } catch (submitError) {
      toast({
        variant: "destructive",
        title: "Création impossible",
        description: submitError instanceof Error ? submitError.message : "Réessayez dans un instant.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10" aria-busy="true">
        <Card><CardContent className="flex items-center justify-center gap-3 p-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" aria-hidden="true" />Chargement de votre brouillon…</CardContent></Card>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card><CardContent className="space-y-4 p-6">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>Réessayer</Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Rocket className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Construisez votre espace vendeur</h1>
          <p className="mt-1 text-sm text-muted-foreground">Un questionnaire progressif pour préparer une boutique claire et adaptée à votre activité.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">{step + 1}. {STEPS[step]}</CardTitle>
              <CardDescription className="mt-1">Les champs marqués * sont nécessaires pour poursuivre. Les autres sont facultatifs.</CardDescription>
            </div>
            <span className="text-sm font-medium text-muted-foreground">{step + 1} / {STEPS.length}</span>
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} aria-label={`Progression : ${step + 1} étapes sur ${STEPS.length}`} />
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-6">
            {stepContent[step]}

            {step === 3 && (
              <div className="space-y-2">
                <Label htmlFor="store-slug">Adresse de la boutique (facultatif)</Label>
                <div className="flex items-center gap-2">
                  <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">billograph.bj/#/boutique/</span>
                  <Input
                    id="store-slug"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={48}
                    value={slug || (!slugTouched ? slugify(answers.publicName ?? "") : "")}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setSlug(slugify(event.target.value));
                    }}
                    className="h-11"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" className="h-11" onClick={handleBack} disabled={step === 0 || saving || submitting}>
                <ArrowLeft className="size-4" aria-hidden="true" /> Retour
              </Button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="ghost" className="h-11" onClick={() => void handleSaveAndExit()} disabled={saving || submitting}>
                  <Save className="size-4" aria-hidden="true" />
                  {saving ? "Enregistrement…" : "Enregistrer et continuer plus tard"}
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button type="button" className="h-11" onClick={() => void handleNext()} disabled={saving || submitting}>
                    Continuer <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button type="submit" className="h-11" disabled={submitting || saving}>
                    {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                    {submitting ? "Création en cours…" : "Créer ma boutique"}
                  </Button>
                )}
              </div>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CircleHelp className="size-3.5" aria-hidden="true" />
              {saving ? "Sauvegarde en cours…" : lastSaved ? `Brouillon sauvegardé à ${lastSaved.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Vos réponses sont sauvegardées automatiquement."}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
