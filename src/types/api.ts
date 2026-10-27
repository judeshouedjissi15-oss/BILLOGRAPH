// Types TypeScript partagés — miroir exact des contrats dans API_CONTRACTS.md.

export type Role = "CLIENT" | "VENDEUR" | "ADMIN";
export type OrderStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED" | "DELIVERED";
export type ProductType = "DIGITAL" | "PHYSICAL";
export type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  // OFFICE (module « Magnifier son appel ») — poste d'officier du compte.
  officeRole: string | null;
  officeStatus: string | null;
  officeLabel: string | null;
  officeActive: boolean;
  // Profil — photo de profil, téléphone, confirmation d'email, inscription.
  avatarUrl: string | null;
  phone: string | null;
  emailVerified: boolean;
  createdAt: string;
  // PROFIL PUBLIC — personnalisation libre (vendeurs et tous les rôles).
  headline: string | null;
  bio: string | null;
  city: string | null;
};

export type Store = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  phone: string | null;
  status: string;
  createdAt: string;
};

export type PublicProduct = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  type: ProductType;
  category: string;
  priceXOF: number;
  imageUrl: string | null;
  hasFile: boolean;
  stock: number | null;
  createdAt: string;
};

export type PublicProductDetail = PublicProduct & {
  fileName: string | null;
  fileSize: number | null;
};

export type VendorProduct = PublicProduct & {
  status: ProductStatus;
  storeId: string;
  fileName: string | null;
  fileSize: number | null;
};

export type DownloadTokenInfo = {
  token: string;
  expiresAt: string;
  downloadCount: number;
  maxDownloads: number;
};

export type OrderItemInfo = {
  titleSnapshot: string;
  quantity: number;
  unitPriceXOF: number;
};

export type PublicOrder = {
  reference: string;
  status: OrderStatus;
  totalXOF: number;
  paymentMethod: string;
  createdAt: string;
  paidAt: string | null;
  items: OrderItemInfo[];
  customerEmail?: string;
};

export type VendorOrder = {
  reference: string;
  status: OrderStatus;
  totalXOF: number;
  commissionXOF: number;
  paymentMethod: string;
  createdAt: string;
  paidAt: string | null;
  customer: { name: string; email: string; phone?: string | null };
  items: OrderItemInfo[];
  downloadTokens: DownloadTokenInfo[];
};

export type CheckoutResponse = {
  order: { reference: string; status: OrderStatus; totalXOF: number; paymentMethod: string };
  checkout: {
    flow: "redirect" | "free" | "ussd";
    redirectUrl?: string;
    reference?: string;
    providerRef?: string;
    instructions?: string;
  };
};

// GET /api/payments/status — état public de la configuration des paiements.
export type PaymentStatusInfo = {
  configured: boolean;
  provider: "FEDAPAY" | null;
  environment: "sandbox" | "live" | null;
};

// Bloc payments de GET/PATCH /api/admin/settings.
export type AdminPaymentsInfo = {
  provider: string;
  configured: boolean;
  environment: "sandbox" | "live" | null;
  secretKeyMasked: string | null;
  webhookSecretMasked: string | null;
  webhookUrl: string;
};

export type VendorStats = {
  totals: { revenueXOF: number; commissionXOF: number; netXOF: number; ordersCount: number; customersCount: number };
  period: { revenueXOF: number; ordersCount: number; days: number };
  series: { date: string; revenueXOF: number; ordersCount: number }[];
  topProducts: { title: string; units: number; revenueXOF: number }[];
  latestOrders: { reference: string; status: OrderStatus; totalXOF: number; createdAt: string; customerName: string }[];
};

export type MyPurchases = {
  orders: {
    reference: string;
    status: string;
    createdAt: string;
    items: {
      title: string;
      productId: string;
      download: DownloadTokenInfo | null;
    }[];
  }[];
};

export type AdminStats = {
  users: number;
  stores: number;
  products: number;
  orders: { count: number; pendingCount: number; paidCount: number };
  gmvXOF: number;
  commissionXOF: number;
  recentAudit: AuditEntry[];
};

export type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: string | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
};

export type AdminUser = User & { createdAt: string; storeSlug: string | null; supervisorName?: string | null; supervisorId?: string | null };
export type AdminStore = Store & { ownerEmail: string; productsCount: number };

// PRODUITS — version admin (GET /api/admin/products, tous statuts, toutes boutiques).
export type AdminProduct = {
  id: string;
  title: string;
  slug: string;
  type: ProductType;
  category: string;
  priceXOF: number;
  status: ProductStatus;
  stock: number | null;
  hasFile: boolean;
  createdAt: string;
  store: { id: string; name: string; slug: string; status: string };
};

// DÉTAIL D'UNE BOUTIQUE (admin) — GET /api/admin/stores/[id] :
// tout ce qui se passe chez ce vendeur, lisible d'un seul coup d'œil.
export type AdminStoreDetail = {
  store: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    color: string;
    phone: string | null;
    status: string;
    createdAt: string;
  };
  owner: { name: string; email: string; status: string; emailVerified: boolean };
  products: {
    id: string;
    title: string;
    slug: string;
    type: ProductType;
    priceXOF: number;
    status: ProductStatus;
    stock: number | null;
    createdAt: string;
  }[];
  orders: {
    reference: string;
    status: OrderStatus;
    totalXOF: number;
    commissionXOF: number;
    customerName: string;
    customerEmail: string;
    createdAt: string;
  }[];
  withdrawals: {
    id: string;
    amountXOF: number;
    method: string;
    status: string;
    requestedAt: string;
  }[];
  wallet: VendorWalletInfo;
  counts: { products: number; orders: number; paidOrders: number };
};

// BARRE D'ANNONCE — version publique (GET /api/announcements/active).
export type ActiveAnnouncement = {
  id: string;
  message: string;
  link: string | null;
  linkLabel: string | null;
};

// BARRE D'ANNONCE — version admin (GET /api/admin/announcements).
export type AdminAnnouncement = ActiveAnnouncement & {
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

// Valeurs BRUTES renvoyées par GET/PATCH /api/admin/settings (null = défaut).
export type PlatformSettingsInfo = {
  commissionPercent: number;
  siteName: string;
  reviewsAutoPublish: boolean;
  siteTagline: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  featuresTitle: string | null;
  featuresSubtitle: string | null;
  audienceTitle: string | null;
  audienceSubtitle: string | null;
  reviewsTitle: string | null;
  reviewsSubtitle: string | null;
  ctaTitle: string | null;
  ctaText: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  socialFacebook: string | null;
  socialInstagram: string | null;
  socialTiktok: string | null;
  socialYoutube: string | null;
  socialTwitter: string | null;
  footerText: string | null;
  // Présentation de l'auteur du site (null = défaut du code).
  authorName: string | null;
  authorRole: string | null;
  authorBio: string | null;
};

// AVIS — version publique (GET /api/reviews, statut APPROVED uniquement).
export type ReviewItem = {
  id: string;
  authorName: string;
  authorRole: string | null;
  authorCity: string | null;
  rating: number;
  content: string;
  createdAt: string;
};

// AVIS — version admin (GET /api/admin/reviews, tous statuts).
export type AdminReview = {
  id: string;
  authorName: string;
  authorRole: string | null;
  authorCity: string | null;
  rating: number;
  content: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  userId: string | null;
  moderatedAt: string | null;
  createdAt: string;
};

export type AdminReviewsResponse = {
  reviews: AdminReview[];
  counts: { total: number; pending: number; approved: number; rejected: number };
};

// PORTEFEUILLE VENDEUR — GET /api/vendor/wallet
export type VendorWalletInfo = {
  grossXOF: number;
  commissionXOF: number;
  netXOF: number;
  pendingXOF: number;
  paidOutXOF: number;
  availableXOF: number;
};

export type WithdrawalInfo = {
  id: string;
  amountXOF: number;
  method: "MOBILE_MONEY" | "BANK_TRANSFER";
  destination: string;
  status: "PENDING" | "APPROVED" | "PAID" | "REJECTED";
  providerRef: string | null;
  adminNote: string | null;
  requestedAt: string;
  processedAt: string | null;
};

export type VendorWalletResponse = {
  wallet: VendorWalletInfo;
  withdrawals: WithdrawalInfo[];
};

// RETRAITS — version admin (GET /api/admin/withdrawals)
export type AdminWithdrawal = WithdrawalInfo & {
  processedByName: string | null;
  store: {
    name: string;
    slug: string;
    ownerName: string;
    ownerEmail: string;
  };
};

export type AdminWithdrawalsResponse = {
  counts: { total: number; pending: number; approved: number; paid: number; rejected: number };
  withdrawals: AdminWithdrawal[];
};

// NOTIFICATIONS — GET /api/notifications
export type NotificationItem = {
  id: string;
  type: "SALE" | "PAYMENT" | "WITHDRAWAL" | "WITHDRAWAL_REQUEST" | "SYSTEM";
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationsResponse = {
  unreadCount: number;
  items: NotificationItem[];
};


// ═══ CORBEILLE D'ADMINISTRATION ═══
// Tout ce que quiconque supprime reste ici : récupérable et prouvable.
export type TrashEntity =
  | "PRODUCT"
  | "REVIEW"
  | "ANNOUNCEMENT"
  | "TRAINING"
  | "TASK"
  | "CALENDAR";

export type TrashItem = {
  entity: TrashEntity;
  id: string;
  title: string;
  subtitle: string | null;
  deletedAt: string;
  deletedByName: string | null;
};

// ═══ MODULE « MAGNIFIER SON APPEL » — TYPES DE L'ESPACE PROFESSIONNEL ═══

export type OfficeTaskTemplateInfo = {
  title: string;
  description: string;
  priority: "BASSE" | "NORMALE" | "HAUTE" | "URGENTE";
  dueInDays: number;
};

export type OfficeDefinitionInfo = {
  key: string;
  label: string;
  officeName: string;
  order: number;
  mission: string;
  responsibilities: string[];
  authorityLimits: string[];
  expectedResults: string[];
  taskTemplates: OfficeTaskTemplateInfo[];
  canHaveAdjoints: boolean;
  welcomeNote: string;
};

export type OfficeOverview = {
  office: OfficeDefinitionInfo;
  /** true quand le PROPRIÉTAIRE agit dans un office qui n'est pas le sien
   *  (capacités d'officier héritées) — l'UI adapte l'affichage. */
  asOwner?: boolean;
  account: { role: string; name: string; email: string };
  counts: {
    tasks: Record<string, number>;
    tasksDoneTotal: number;
    objectives: number;
    objectivesReached: number;
    adjoints: number;
    pendingValidations: number;
    unreadNotifications: number;
    trainingResources: number;
  };
  recentDoneTasks: { id: string; title: string; reviewedAt: string | null; assigneeName?: string | null }[];
};

export type OfficeTaskCommentInfo = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type OfficeTaskInfo = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  source: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  assignee: { id: string; name: string; isMe: boolean };
  createdByName: string;
  createdByMe: boolean;
  canReview: boolean;
  comments: OfficeTaskCommentInfo[];
};

export type OfficeObjectivesResponse = {
  objectives: {
    id: string;
    title: string;
    description: string | null;
    metric: string | null;
    target: number | null;
    achieved: number;
    unit: string | null;
    period: string;
    priority: string;
    deadline: string | null;
    status: string;
    progressNote: string | null;
    createdAt: string;
  }[];
  realStats: { doneToday: number; doneThisWeek: number; doneThisMonth: number; doneTotal: number };
};

export type OfficeReportInfo = {
  id: string;
  periodLabel: string;
  realizations: string;
  difficulties: string | null;
  unresolved: string | null;
  needs: string | null;
  tasksDoneCount: number;
  createdAt: string;
};

export type OfficeReportsResponse = {
  reports: OfficeReportInfo[];
  doneTasks: { id: string; title: string; reviewedAt: string | null; assigneeName?: string | null }[];
};

export type OfficeCalendarResponse = {
  events: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    startsAt: string;
    location: string | null;
  }[];
  taskDeadlines: {
    id: string;
    title: string;
    dueDate: string | null;
    priority: string;
  }[];
};

export type OfficeAdjointsResponse = {
  canManageAdjoints: boolean;
  asOwner?: boolean;
  maxAdjoints: number;
  activeAdjoints: number;
  pendingValidations: number;
  adjoints: {
    id: string;
    name: string;
    email: string;
    active: boolean;
    isTitulaire?: boolean;
    supervisorName?: string | null;
    attributedAt: string;
    tasks: { open: number; done: number; awaiting: number };
  }[];
};

export type OfficeTrainingResourceInfo = {
  id: string;
  officeRole: string | null;
  title: string;
  category: string;
  body: string | null;
  externalUrl: string | null;
  publishedByName: string;
  updatedAt: string;
};

export type OfficeHelpRequestInfo = {
  id: string;
  category: string;
  subject: string;
  message: string;
  confidential: boolean;
  status: string;
  response: string | null;
  requesterName?: string | null;
  requesterIsMe?: boolean;
  respondedByName: string | null;
  respondedAt: string | null;
  createdAt: string;
};

export type OfficeHistoryEntry = {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  details: string | null;
  authorName: string;
  fromAdjoint: boolean;
  createdAt: string;
};

// ═══ SUPERVISION DES OFFICES (administration) ═══

export type AdminOfficeMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  officeRole: string | null;
  officeStatus: string | null;
  officeActivatedAt: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
};

export type AdminOfficeOverview = {
  effectifs: {
    key: string;
    label: string;
    officeName: string;
    canHaveAdjoints: boolean;
    active: number;
    max: number;
    statusCounts: Record<string, number>;
  }[];
  members: AdminOfficeMember[];
  pendingOwnerValidations: {
    id: string;
    title: string;
    officeRole: string | null;
    priority: string;
    submittedAt: string | null;
    assigneeName: string;
  }[];
  helpRequests: {
    id: string;
    subject: string;
    message: string;
    category: string;
    confidential: boolean;
    status: string;
    response: string | null;
    respondedByName: string | null;
    respondedAt: string | null;
    createdAt: string;
    requesterName: string;
    requesterOfficeRole: string | null;
  }[];
  recentReports: {
    id: string;
    periodLabel: string;
    realizations: string;
    tasksDoneCount: number;
    createdAt: string;
    officerName: string;
    officerOfficeRole: string | null;
  }[];
  recentActivities: {
    id: string;
    action: string;
    entityType: string;
    details: string | null;
    createdAt: string;
    authorName: string;
    authorOfficeRole: string | null;
  }[];
  trainingCount: number;
};

export type AdminTrainingResource = {
  id: string;
  officeRole: string | null;
  title: string;
  category: string;
  body: string | null;
  externalUrl: string | null;
  active: boolean;
  publishedByName: string;
  updatedAt: string;
};
