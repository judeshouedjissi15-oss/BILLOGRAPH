"use client";

// Shell unique de l'application : routeur par hash + header + main + footer collant.
// L'utilisateur ne voit que la route `/` — toutes les vues vivent en SPA via le hash.

import { useEffect } from "react";
import { useHashRoute } from "@/components/billograph/lib/use-hash-route";
import { useUser } from "@/components/billograph/lib/use-user";
import { Header } from "@/components/billograph/header";
import { Footer } from "@/components/billograph/footer";
import { AnnouncementBar } from "@/components/billograph/announcement-bar";
import { Landing } from "@/components/billograph/landing";
import { AuthView } from "@/components/billograph/auth-view";
import { VendorDashboard } from "@/components/billograph/vendor/dashboard";
import { ProductFormPage } from "@/components/billograph/vendor/product-form-page";
import { VendorOrderPage } from "@/components/billograph/vendor/order-detail-page";
import { StoreView } from "@/components/billograph/storefront/store-view";
import { ProductView } from "@/components/billograph/storefront/product-view";
import { CheckoutPage } from "@/components/billograph/storefront/checkout-page";
import { OrderView } from "@/components/billograph/storefront/order-view";
import { PurchasesView } from "@/components/billograph/purchases-view";
import { AdminView } from "@/components/billograph/admin/admin-view";
import { OfficeWorkspace } from "@/components/billograph/office/workspace";
import { ProfileView } from "@/components/billograph/profile-view";
import { MemberView } from "@/components/billograph/member-view";
import { LegalView, type LegalDocument } from "@/components/billograph/legal-view";
import { EmailVerificationPage } from "@/components/billograph/email-verification-page";
import { RechmialView } from "@/components/billograph/rechmial/rechmial-view";
import { NotFoundView } from "@/components/billograph/not-found";
import { LoginRequired, PageSkeleton } from "@/components/billograph/fallbacks";
import { SiteDataProvider } from "@/components/billograph/lib/site-data";

export default function Home() {
  const route = useHashRoute();
  const { user, loading, refresh, logout } = useUser();

  // Remonter en haut de page à chaque changement de vue.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [route.name, route.param]);

  const viewKey = `${route.name}:${route.param ?? ""}`;

  function renderView() {
    switch (route.name) {
      case "home":
        return <Landing user={user} />;
      case "auth":
        return <AuthView user={user} userLoading={loading} refreshUser={refresh} />;
      case "dashboard":
        if (loading) return <PageSkeleton />;
        if (!user) return <LoginRequired />;
        return (
          <VendorDashboard
            user={user}
            refreshUser={refresh}
            initialTab={route.param === "produits" ? "products" : route.param === "commandes" ? "orders" : "overview"}
          />
        );
      case "product-new":
      case "product-edit":
        if (loading) return <PageSkeleton />;
        if (!user) return <LoginRequired />;
        return (
          <ProductFormPage
            productId={route.name === "product-edit" ? route.param ?? null : null}
          />
        );
      case "vendor-order":
        if (loading) return <PageSkeleton />;
        if (!user) return <LoginRequired />;
        return <VendorOrderPage reference={route.param ?? ""} />;
      case "checkout":
        return <CheckoutPage slug={route.param ?? ""} />;
      case "boutique":
        return <StoreView slug={route.param ?? ""} />;
      case "produit":
        return <ProductView slug={route.param ?? ""} />;
      case "commande":
        return <OrderView reference={route.param ?? ""} />;
      case "purchases":
        return <PurchasesView />;
      case "professionnel": {
        if (loading) return <PageSkeleton />;
        if (!user) return <LoginRequired />;
        return <OfficeWorkspace user={user} initialSection={route.param} />;
      }
      case "profil":
        if (loading) return <PageSkeleton />;
        if (!user) return <LoginRequired />;
        return <ProfileView user={user} refreshUser={refresh} />;
      case "membre":
        return <MemberView memberId={route.param ?? ""} />;
      case "admin":
        if (loading) return <PageSkeleton />;
        if (!user) return <LoginRequired />;
        return <AdminView user={user} />;
      case "legal":
        return <LegalView document={route.param as LegalDocument} />;
      case "verify-email":
        return <EmailVerificationPage token={route.param ?? ""} refreshUser={refresh} />;
      case "rechmial":
        if (loading) return <PageSkeleton />;
        if (!user) return <LoginRequired />;
        return <RechmialView user={user} />;
      default:
        return <NotFoundView />;
    }
  }

  return (
    <SiteDataProvider>
      <div className="flex min-h-screen flex-col">
        <AnnouncementBar />
        <Header route={route} user={user} userLoading={loading} onLogout={logout} />
        <main key={viewKey} className="flex-1 animate-in fade-in duration-300">
          {renderView()}
        </main>
        <Footer />
      </div>
    </SiteDataProvider>
  );
}
