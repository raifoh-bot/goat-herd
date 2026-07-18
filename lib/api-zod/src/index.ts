export * from "./generated/api";
export * from "./generated/types";

// Request-body schema names exist as zod schemas (values) in ./generated/api and
// as TypeScript interfaces (types) in ./generated/types. Star-exporting both makes
// these names ambiguous (TS2308). Consumers only use the zod schema values
// (`.safeParse`), so explicitly re-export them from ./generated/api to resolve the
// ambiguity in favor of the runtime schemas.
export {
  AddGoatPhotoBody,
  AddKidsBody,
  ChangeOwnPasswordBody,
  CreateBreedingBody,
  CreateBreedingEventBody,
  CreateFarmBody,
  CreateGoatBody,
  CreatePregnancyTestBody,
  UpdatePregnancyTestBody,
  CreateSemenStrawBody,
  CreateShowBody,
  CreateShowResultsBody,
  CreateUserBody,
  DeleteFarmBody,
  ForgotPasswordBody,
  ResetPasswordBody,
  ImportBreedingsBody,
  ImportGoatsBody,
  ImportKidsBody,
  ImportSemenStrawsBody,
  LoginBody,
  LoginResponse,
  RegisterFarmBody,
  SetGoatDefaultPhotoBody,
  SetUserPasswordBody,
  UpdateDashboardLayoutBody,
  UpdateOwnEmailBody,
  UpdatePlatformSettingsBody,
  UpdateBreedingBody,
  UpdateBreedingEventBody,
  UpdateFarmBody,
  UpdateSettingsBody,
  UpdateGoatBody,
  UpdateKidBody,
  UpdateSemenStrawBody,
  UpdateShowBody,
  UpdateShowResultBody,
  UpdateUserBody,
} from "./generated/api";
