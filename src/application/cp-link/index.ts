/**
 * لینک CP — قرارداد مرزی مشترک بین نود و کنترل‌پلین
 *  • body.ts — CP-5: سقف بدنهٔ پاسخ پیش از parse (طرح ارتقا §۳-۵/§۴ آیتم ۲۴)
 *  • node-db-contract.ts — CP-7: قرارداد خواندنی‌های NODE_DB (§۳-۴/§۴ آیتم ۲۶)
 */
export {
  CP_RESPONSE_BODY_MAX_BYTES,
  CP_FILE_MAX_BYTES,
  CpBodyTooLargeError,
  readJsonCapped,
  readTextCapped,
  readBytesCapped
} from './body';
export {
  NODE_DB_CONTRACT_TABLES,
  NODE_DB_CONTRACT_CP_SOURCE,
  NODE_DB_CONTRACT_DOC
} from './node-db-contract';
