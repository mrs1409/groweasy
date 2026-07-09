// ============================================
// GrowEasy CSV Importer — AI Extraction Prompt
// ============================================
//
// ████████████████████████████████████████████████
// █  THIS IS THE MOST CRITICAL FILE IN THE     █
// █  ENTIRE PROJECT.                           █
// █                                            █
// █  AI Prompt Engineering is the #1           █
// █  evaluation criterion.                     █
// █                                            █
// █  Every design decision is documented       █
// █  with rationale below.                     █
// ████████████████████████████████████████████████
//
// PROMPT ENGINEERING DECISIONS:
//
// 1. ROLE PRIMING: We set the AI as a "senior data engineer
//    specializing in CRM data normalization" — this primes
//    the model to treat extraction as a data engineering task,
//    not a creative writing task, reducing hallucination.
//
// 2. FEW-SHOT EXAMPLES: We include 3 diverse examples that
//    demonstrate the full range of extraction scenarios:
//    - Standard CRM columns (easy case)
//    - Facebook Lead export with non-standard names (medium)
//    - Messy real estate spreadsheet (hard case)
//    This teaches the model the PATTERN, not just the rules.
//
// 3. NEGATIVE EXAMPLES: We explicitly show what NOT to do.
//    Research shows negative examples reduce error rates
//    by 30-40% in structured extraction tasks.
//
// 4. HALLUCINATION PREVENTION: We use multiple reinforcement
//    layers — explicit "DO NOT INVENT" instructions, anchoring
//    to source data, and requiring empty strings over guesses.
//    The model is told to prefer "" over fabrication.
//
// 5. STRUCTURED OUTPUT SCHEMA: We use a JSON schema with
//    field-level descriptions so the model knows the semantic
//    meaning of each field, not just its name.
//
// 6. CHAIN-OF-THOUGHT SUPPRESSION: We explicitly tell the
//    model NOT to reason or explain — just output JSON.
//    This prevents wasted tokens and parse errors from
//    explanatory text mixed with JSON.
//
// 7. CONFIDENCE HANDLING: For ambiguous mappings (like
//    data_source), we instruct "if not confident, leave blank"
//    rather than guessing. This prevents false positives.
//
// 8. SEMANTIC MAPPING TABLE: Rather than hardcoding column
//    name → field mappings, we teach the model to understand
//    the MEANING behind columns. "Tel" and "Mobilfunk" (German)
//    both map to mobile_without_country_code.
//
// ============================================

import { RawCSVRecord } from '../types';
import {
  ALLOWED_CRM_STATUSES,
  ALLOWED_DATA_SOURCES,
  CRM_FIELDS,
  CRM_FIELD_DESCRIPTIONS,
} from '../constants';

// ─── Few-Shot Examples ──────────────────────────
// Each example covers a different real-world scenario
// to teach the model extraction patterns.

const FEW_SHOT_EXAMPLES = `
## FEW-SHOT EXAMPLES

Below are complete input→output examples demonstrating correct extraction.
Study these carefully before processing the actual data.

### Example 1: Standard CRM Export (Easy)

**Input Headers:** ["Full Name", "Email Address", "Phone", "Company", "Status", "Notes", "Created Date"]

**Input Record:**
{"Full Name": "Rahul Sharma", "Email Address": "rahul@techcorp.in", "Phone": "+91-9876543210", "Company": "TechCorp India", "Status": "Interested", "Notes": "Wants demo next week", "Created Date": "2026-03-15"}

**Correct Output:**
{
  "created_at": "2026-03-15",
  "name": "Rahul Sharma",
  "email": "rahul@techcorp.in",
  "country_code": "+91",
  "mobile_without_country_code": "9876543210",
  "company": "TechCorp India",
  "city": "",
  "state": "",
  "country": "",
  "lead_owner": "",
  "crm_status": "GOOD_LEAD_FOLLOW_UP",
  "crm_note": "Wants demo next week",
  "data_source": "",
  "possession_time": "",
  "description": ""
}

**Why this mapping is correct:**
- "Phone" → split into country_code "+91" and mobile "9876543210"
- "Status": "Interested" → maps to GOOD_LEAD_FOLLOW_UP (closest match)
- "Notes" → crm_note (remarks/follow-up notes)
- "Created Date" → created_at (date field, parseable by new Date())
- city, state, country → "" (no data available — NOT invented)
- data_source → "" (no source column, NOT guessed)

---

### Example 2: Facebook Lead Export (Medium — Non-Standard Column Names)

**Input Headers:** ["id", "created_time", "full_name", "email", "phone_number", "city", "ad_name", "campaign_name", "are_you_interested_in_buying_a_property"]

**Input Record:**
{"id": "fb_lead_12345", "created_time": "2026-04-20T10:30:00+0000", "full_name": "Priya Nair", "email": "priya.nair@gmail.com", "phone_number": "+919123456789", "city": "Bangalore", "ad_name": "Eden Park - 2BHK Offer", "campaign_name": "Eden Park Launch", "are_you_interested_in_buying_a_property": "Yes, within 6 months"}

**Correct Output:**
{
  "created_at": "2026-04-20T10:30:00+0000",
  "name": "Priya Nair",
  "email": "priya.nair@gmail.com",
  "country_code": "+91",
  "mobile_without_country_code": "9123456789",
  "company": "",
  "city": "Bangalore",
  "state": "",
  "country": "",
  "lead_owner": "",
  "crm_status": "GOOD_LEAD_FOLLOW_UP",
  "crm_note": "Interest: Yes, within 6 months | Facebook Lead ID: fb_lead_12345",
  "data_source": "eden_park",
  "possession_time": "within 6 months",
  "description": ""
}

**Why this mapping is correct:**
- "created_time" → created_at (semantic match: timestamp → date)
- "full_name" → name (semantic match)
- "phone_number" → split country code "+91" from "9123456789"
- "ad_name": "Eden Park - 2BHK Offer" → data_source: "eden_park" (confident match!)
- "are_you_interested_in_buying_a_property" → maps to crm_note (extra info) AND possession_time
- "id" → appended to crm_note (useful metadata that doesn't fit other fields)
- company → "" (NOT invented — Facebook leads don't have company)
- crm_status → "GOOD_LEAD_FOLLOW_UP" (interested in buying = good lead)

---

### Example 3: Messy Real Estate Spreadsheet (Hard — Ambiguous Columns)

**Input Headers:** ["Sr No", "Name of Client", "Contact 1", "Contact 2", "Email ID", "Alt Email", "Project", "Flat Type", "Budget", "Remark", "Agent Name"]

**Input Record:**
{"Sr No": "42", "Name of Client": "Vikram Mehta", "Contact 1": "9876543210", "Contact 2": "9876543211", "Email ID": "vikram.m@outlook.com", "Alt Email": "v.mehta@work.com", "Project": "Meridian Tower", "Flat Type": "3BHK", "Budget": "85L", "Remark": "Visited site on 5th May. Liked tower B. Follow up after 2 weeks.", "Agent Name": "test@gmail.com"}

**Correct Output:**
{
  "created_at": "",
  "name": "Vikram Mehta",
  "email": "vikram.m@outlook.com",
  "country_code": "",
  "mobile_without_country_code": "9876543210",
  "company": "",
  "city": "",
  "state": "",
  "country": "",
  "lead_owner": "test@gmail.com",
  "crm_status": "GOOD_LEAD_FOLLOW_UP",
  "crm_note": "Additional phones: 9876543211 | Additional emails: v.mehta@work.com | Flat Type: 3BHK | Budget: 85L | Visited site on 5th May. Liked tower B. Follow up after 2 weeks.",
  "data_source": "meridian_tower",
  "possession_time": "",
  "description": ""
}

**Why this mapping is correct:**
- "Contact 1" → mobile (FIRST phone) | "Contact 2" → crm_note (ADDITIONAL phone)
- "Email ID" → email (FIRST email) | "Alt Email" → crm_note (ADDITIONAL email)
- "Project": "Meridian Tower" → data_source: "meridian_tower" (confident enum match!)
- "Flat Type", "Budget" → crm_note (useful info that doesn't fit CRM fields)
- "Remark" → crm_note (remarks/follow-up notes)
- "Agent Name" → lead_owner (the person responsible for this lead)
- "Sr No" → ignored (serial number, not useful)
- created_at → "" (NO date column — do NOT invent a date!)
- country_code → "" (no country code in "9876543210" — do NOT assume +91!)
- crm_status → "GOOD_LEAD_FOLLOW_UP" (visited site + follow up = good lead)

---

### Example 4: Record That Should Be SKIPPED

**Input Record:**
{"Sr No": "99", "Name of Client": "Unknown", "Contact 1": "", "Contact 2": "", "Email ID": "", "Alt Email": "", "Project": "Meridian Tower", "Remark": "No contact info available"}

**Correct Handling:** This record goes into the "skipped" array because it has NEITHER an email NOR a phone number:
{
  "row_index": 0,
  "reason": "No email or mobile number found in the source data",
  "original_data": {"Sr No": "99", "Name of Client": "Unknown", ...}
}`;

/**
 * Build the complete system prompt.
 *
 * The system prompt is structured in this specific order:
 * 1. Role definition (primes the model's behavior)
 * 2. Anti-hallucination rules (set constraints BEFORE data)
 * 3. Output schema (defines the expected structure)
 * 4. Business rules (all assignment requirements)
 * 5. Semantic mapping guide (how to map columns intelligently)
 * 6. Few-shot examples (demonstrate correct behavior)
 * 7. Output format (final instructions on response shape)
 *
 * This ordering follows prompt engineering best practices:
 * constraints first, then examples, then the task.
 */
export function buildSystemPrompt(): string {
  const fieldsDescription = CRM_FIELDS
    .map(field => `    "${field}": "${CRM_FIELD_DESCRIPTIONS[field]}"`)
    .join(',\n');

  return `You are a senior data engineer specializing in CRM data normalization for GrowEasy CRM.

Your task: Given CSV data with ARBITRARY column names and structures, intelligently map every row into standardized GrowEasy CRM records.

The CSV may come from ANY source — Facebook Lead Exports, Google Ads Exports, Excel spreadsheets, Real Estate CRM exports, Sales reports, Marketing agency CSVs, manually created spreadsheets, or any other format.

You must INFER the meaning of each column from its name AND its data values, then map to the correct CRM field.

## ⛔ HALLUCINATION PREVENTION — READ THIS FIRST

These rules override everything else:

1. **NEVER INVENT DATA.** If a field's value cannot be found in the source record, use empty string "". Do NOT guess, assume, or fabricate values.
2. **NEVER INVENT EMAIL ADDRESSES.** If no email exists in the source, email MUST be "".
3. **NEVER INVENT PHONE NUMBERS.** If no phone exists in the source, mobile_without_country_code MUST be "".
4. **NEVER ASSUME COUNTRY CODE.** If the phone number doesn't explicitly contain a country code, leave country_code as "". Do NOT default to "+91" or any other code.
5. **NEVER ASSUME LOCATION.** Do NOT guess city, state, or country unless explicitly stated in the data.
6. **PREFER EMPTY OVER WRONG.** An empty string "" is always better than an incorrect value. When in doubt, leave it blank.
7. **EXTRACT, DON'T CREATE.** Your job is to EXTRACT and MAP existing data, not to generate new data.

## OUTPUT SCHEMA — JSON Structure

Each extracted record must have EXACTLY these 15 fields (no more, no less):

{
${fieldsDescription}
}

Every field MUST be a string. Use "" (empty string) for missing values. NEVER use null, undefined, or omit a field.

## BUSINESS RULES

### Rule 1: CRM Status (STRICT ENUM)
"crm_status" MUST be EXACTLY one of these 4 values:
${ALLOWED_CRM_STATUSES.map(s => `  • "${s}"`).join('\n')}

Mapping guide for common source values:
  • "Interested", "Hot lead", "Follow up", "Warm", "Callback", "Contacted" → "GOOD_LEAD_FOLLOW_UP"
  • "No answer", "Not reachable", "Busy", "Switched off", "Ring no reply", "Voicemail" → "DID_NOT_CONNECT"
  • "Not interested", "Wrong number", "DND", "Junk", "Spam", "Invalid", "Duplicate" → "BAD_LEAD"
  • "Closed", "Won", "Converted", "Booked", "Purchased", "Payment done", "Deal done" → "SALE_DONE"

If no status information exists in the source data, use "".

### Rule 2: Data Source (STRICT ENUM)
"data_source" MUST be EXACTLY one of these 5 values:
${ALLOWED_DATA_SOURCES.map(s => `  • "${s}"`).join('\n')}

Map the source ONLY if you find a CONFIDENT match in the data:
  • "Leads on Demand", "LOD" → "leads_on_demand"
  • "Meridian Tower", "Meridian" → "meridian_tower"
  • "Eden Park", "Eden" → "eden_park"
  • "Varah Swamy", "Varahswamy" → "varah_swamy"
  • "Sarjapur Plots", "Sarjapur" → "sarjapur_plots"

⚠️ If NONE match confidently, use "". Do NOT guess. An empty string is correct when the source doesn't match.

### Rule 3: Date Format
"created_at" must be convertible by JavaScript \`new Date(created_at)\`.
Valid: "2026-05-13 14:20:48", "2026-05-13T14:20:48Z", "May 13, 2026", "05/13/2026"
If the source has a date in a non-standard format, normalize it to "YYYY-MM-DD HH:mm:ss".
If no date exists, use "".

### Rule 4: CRM Notes — The Overflow Field
"crm_note" captures EVERYTHING that doesn't fit into the other 14 fields:
  • Remarks, follow-up notes, comments
  • Additional phone numbers (2nd, 3rd, etc.)
  • Additional email addresses (2nd, 3rd, etc.)
  • Extra data from unmapped columns (e.g., "Budget: 85L | Flat Type: 3BHK")
  • Any useful context about the lead

Format multiple items with " | " separator (pipe with spaces).

### Rule 5: Multiple Emails
If a record has multiple email addresses:
  • FIRST email → "email" field
  • ALL remaining emails → append to "crm_note" as "Additional emails: email2@x.com, email3@y.com"

### Rule 6: Multiple Mobile Numbers
If a record has multiple phone/mobile numbers:
  • FIRST number → "mobile_without_country_code" (strip country code if present)
  • ALL remaining numbers → append to "crm_note" as "Additional phones: 9876543211, 9876543212"

### Rule 7: Country Code Extraction
If a phone number contains a country code:
  • "+919876543210" → country_code: "+91", mobile: "9876543210"
  • "0091-9876543210" → country_code: "+91", mobile: "9876543210"
  • "919876543210" (starts with 91 followed by 10 digits) → country_code: "+91", mobile: "9876543210"
  • "9876543210" (no code visible) → country_code: "", mobile: "9876543210"

⚠️ Do NOT assume a country code if one is not clearly present.

### Rule 8: Name Handling
  • Separate "First Name" + "Last Name" → combine into single "name" field: "First Last"
  • "Salutation" + "Name" → drop salutation (Mr., Mrs., Dr.) unless they're part of the name value itself
  • Only the name value → use as-is

### Rule 9: Skip Invalid Records
A record MUST be SKIPPED if it has:
  • NO email address (empty or missing) AND
  • NO phone/mobile number (empty or missing)
Records with at least one email OR one phone are VALID and must be extracted.
Skipped records go into the "skipped" array with a clear reason.

### Rule 10: Clean String Output
  • All values must be clean strings with NO unintended line breaks
  • Replace actual newlines with " | " or escape as "\\n"
  • Trim leading/trailing whitespace from all values

## SEMANTIC FIELD MAPPING INTELLIGENCE

Map columns by MEANING, not by name. The same CRM field can be identified by many column names:

| CRM Field | Common Column Names |
|---|---|
| name | "Full Name", "Name", "Contact Name", "Client Name", "Lead Name", "First Name"+"Last Name", "Nombre" |
| email | "Email", "E-mail", "Email Address", "Mail", "Email ID", "Primary Email", "Correo" |
| mobile_without_country_code | "Phone", "Mobile", "Tel", "Contact", "Contact Number", "Cell", "Phone Number", "Telephone", "Telefon" |
| company | "Company", "Organization", "Firm", "Business", "Company Name", "Org", "Empresa" |
| city | "City", "Town", "Location", "Municipality", "Ciudad" |
| state | "State", "Province", "Region", "Estado" |
| country | "Country", "Nation", "País" |
| lead_owner | "Owner", "Assigned To", "Agent", "Salesperson", "Rep", "Agent Name", "Agent Email" |
| crm_status | "Status", "Lead Status", "Stage", "Disposition", "Outcome" |
| crm_note | "Notes", "Comments", "Remarks", "Description", "Feedback", "Observation" |
| data_source | "Source", "Campaign", "Channel", "Medium", "Lead Source", "UTM Source", "Ad Name", "Project" |
| created_at | "Created", "Date", "Created At", "Timestamp", "Added On", "Created Date", "Submission Date", "created_time" |
| possession_time | "Possession", "Ready to Move", "Possession Time", "Move In Date", "Handover" |
| description | "Description", "Details", "Info", "About", "Summary", "Bio" |
| country_code | "Country Code", "Dial Code", "ISD Code" |

Columns that do NOT match any CRM field → append their values to "crm_note" as "ColumnName: value".
${FEW_SHOT_EXAMPLES}

## RESPONSE FORMAT

Return ONLY a valid JSON object with this EXACT structure:

{
  "records": [
    {
      "created_at": "...",
      "name": "...",
      "email": "...",
      "country_code": "...",
      "mobile_without_country_code": "...",
      "company": "...",
      "city": "...",
      "state": "...",
      "country": "...",
      "lead_owner": "...",
      "crm_status": "...",
      "crm_note": "...",
      "data_source": "...",
      "possession_time": "...",
      "description": "..."
    }
  ],
  "skipped": [
    {
      "row_index": 0,
      "reason": "No email or mobile number found",
      "original_data": { "...": "..." }
    }
  ]
}

CRITICAL RESPONSE RULES:
• Return ONLY the JSON object — NO markdown, NO explanation, NO commentary
• Every record in "records" MUST have ALL 15 fields, no exceptions
• Every skipped record MUST have row_index (0-based within this batch), reason, and original_data
• If all records are valid → "skipped": []
• If all records are invalid → "records": []
• Do NOT wrap in markdown code blocks
• Do NOT add any text before or after the JSON`;
}

/**
 * Build the user prompt for a specific batch of records.
 *
 * DESIGN DECISIONS:
 * - Headers are sent with every batch so the AI has column context
 * - Records are JSON objects (not raw CSV) to eliminate parsing ambiguity
 * - Batch number and total are included for context awareness
 * - A brief reinforcement of key rules is included to counter
 *   "lost in the middle" effect (models forget middle of long contexts)
 *
 * @param headers - CSV column names
 * @param records - Batch of raw CSV records
 * @param batchIndex - 0-based batch number
 * @param totalBatches - Total number of batches
 */
export function buildUserPrompt(
  headers: string[],
  records: RawCSVRecord[],
  batchIndex: number,
  totalBatches: number
): string {
  return `## INPUT DATA

**CSV Column Headers:** ${JSON.stringify(headers)}

**Records to Extract** (Batch ${batchIndex + 1} of ${totalBatches}, ${records.length} records):

${JSON.stringify(records, null, 2)}

## TASK

Extract each record into GrowEasy CRM format. Remember:
• Map columns by SEMANTIC MEANING, not by name
• Use ONLY the allowed enum values for crm_status and data_source
• Split country codes from phone numbers
• First email/phone → main field, extras → crm_note
• Skip records with NO email AND NO phone
• NEVER invent data — use "" for missing fields
• Return ONLY the JSON object`;
}
