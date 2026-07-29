export type HarborIdentity = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
};

export type TenantContext = {
  userId: string;
  requestId: string;
};
