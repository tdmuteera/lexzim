import assert from "node:assert/strict";
import {
  classifyChatIntent,
  isWordExportFollowup,
  wantsExplicitWordFile,
} from "../lib/ai/intent";
import { repairRestartedNumberedLists } from "../lib/ai/chat-format";
import { isSubstantialDocumentDraft } from "../lib/ai/drafting/draft-detect";

assert.equal(classifyChatIntent("is incest a crime in zimbabwe"), "legal");
assert.equal(
  classifyChatIntent("lets create a The formal notice that starts the lawsuit. someone owes me money."),
  "document",
);
assert.equal(wantsExplicitWordFile("lets create a The formal notice that starts the lawsuit."), false);
assert.equal(wantsExplicitWordFile("send it as a document"), true);
assert.equal(wantsExplicitWordFile("send it as a doccument"), true);
assert.equal(isWordExportFollowup("send it as a doccument"), true);
assert.equal(isWordExportFollowup("send this as a word document"), true);
assert.equal(isWordExportFollowup("draft a car agreement as a word document"), false);

const repaired = repairRestartedNumberedLists(
  "1. First fact\n\n1. Second fact\n\n1. Third fact\n",
);
assert.match(repaired, /1[.)] First fact/);
assert.match(repaired, /2[.)] Second fact/);
assert.match(repaired, /3[.)] Third fact/);

const summons = `SUMMONS AND DECLARATION
IN THE MAGISTRATES COURT FOR ZIMBABWE
TAKE NOTICE that the plaintiff has instituted action.
The Plaintiff claims payment.
Signed at Harare.
`;
assert.equal(isSubstantialDocumentDraft(summons.repeat(8)), true);
assert.equal(
  isSubstantialDocumentDraft(
    "I've prepared the complete summons above. Copy the entire text and paste it into Microsoft Word.",
  ),
  false,
);

console.log("chat rebuild checks passed");
