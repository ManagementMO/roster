export { openCoachDb, type CoachDb } from "./db.js";
export {
  classifyOutcome,
  classifyToolFailKind,
  isAttributable,
  type CallEvidence,
} from "./classifier.js";
export { cosine, meanVec, normalize, oatsAdjust, type OatsOptions, type OatsResult } from "./oats.js";
export {
  CoachStore,
  defHash,
  type Candidate,
  type RecordOutcomeInput,
  type UpsertResult,
} from "./store.js";
export {
  GEMMA_MODEL,
  MINILM_MODEL,
  MATRYOSHKA_DIMS,
  TransformersEmbeddings,
  selectModelId,
  truncateAndNormalize,
  type EmbeddingsProvider,
} from "./embeddings.js";
export { hashArgs, hashNeed, sha256Hex, stableStringify } from "./util.js";
