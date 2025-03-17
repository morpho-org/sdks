import { type Draft, current, isDraft } from "mutative";
import type { MaybeDraft } from "../handlers/index.js";

export const getCurrent = <T extends object>(draft: MaybeDraft<T>) =>
  isDraft(draft) ? current(draft as Draft<T>) : (draft as T);
