# IMPORTANT

This document is the official project specification.

Every feature, validation rule, UI behavior, API behavior, AI instruction, business rule, evaluation criterion, bonus requirement, and submission requirement described in this document MUST be implemented.

No requirement may be skipped unless explicitly approved by the user.

Whenever implementation changes are made, they must be checked against this document to ensure no requirement has been lost.
**************************************************************
Software Developer (Intern / Full-Time) Assignment
GrowEasy
Website: https://groweasy.ai
Work Mode: Work From Home (WFH)
Joining: Immediate

Compensation
Internship
₹15,000 – ₹20,000 per month
This would be a full time internship with a minimum commitment of 4 months. Candidates would not be able to manage academics and internship simultaneously.
Full-Time
₹35,000 – ₹50,000 per month
For full-time roles, a minimum of one year of post-graduation experience at an organisation is required. 

Submission Instructions
Please complete the assignment below and submit the following to:
varun@groweasy.ai
Your email must include:
Hosted application URL
GitHub repository URL
Position you are applying for:
Software Developer Intern, or
Software Developer (Full-Time)
Submission Deadline: 12 July 2026

Assignment Overview
Build an AI-powered CSV Importer that can intelligently extract CRM lead information from any valid CSV format.
The challenge is not parsing CSV files.
The challenge is allowing users to upload CSVs with different column names, layouts, and structures, while your system accurately maps and extracts the required CRM fields using AI.
For example, these should all work:
Facebook Lead Export
Google Ads Export
Excel sheets
Real Estate CRM exports
Sales reports
Marketing agency CSVs
Manually created spreadsheets
Your application should identify the appropriate fields and convert them into GrowEasy CRM format.

Functional Requirements
The project consists of both a Frontend and Backend.

Frontend Requirements
Create a responsive web application.
Step 1 — Upload CSV
Allow users to upload a valid CSV file.
Examples:
Drag & Drop upload
File Picker

Step 2 — Preview
After upload:
Parse the CSV
Show a preview of uploaded rows
Display data inside a beautiful responsive table
Table should support:
Horizontal scrolling
Vertical scrolling
Sticky headers (preferred)
Responsive design
No AI processing should happen yet.

Step 3 — Confirm Import
Provide a Confirm button.
Only after confirmation should the frontend call the backend API.

Step 4 — Display Parsed Result
Backend returns AI-extracted CRM records.
Display the parsed result in another responsive table.
Show:
Successfully parsed records
Skipped records (if any)
Total imported
Total skipped

Backend Requirements
Create APIs that:
1. Accept CSV Upload
Accept any valid CSV file.
Do not assume column names are fixed.

2. Parse CSV
Convert the CSV into records.

3. AI Extraction
Send records to an AI model in batches.
The AI should intelligently map available fields into GrowEasy CRM format.
You may use OpenAI, Gemini, Claude, or any equivalent LLM.

4. Return Structured JSON
Return extracted CRM records in JSON format.

CRM Fields
Your AI should extract as many of the following fields as possible.
Field
Description
created_at
Lead creation date
name
Lead name
email
Primary email
country_code
Country code
mobile_without_country_code
Mobile number
company
Company name
city
City
state
State
country
Country
lead_owner
Lead owner
crm_status
Lead status
crm_note
Notes/remarks
data_source
Source
possession_time
Property possession time
description
Additional description


Sample CRM Records
created_at,name,email,country_code,mobile_without_country_code,company,city,state,country,lead_owner,crm_status,crm_note,data_source,possession_time,description

2026-05-13 14:20:48,John Doe,john.doe@example.com,+91,9876543210,GrowEasy,Mumbai,Maharashtra,India,test@gmail.com,GOOD_LEAD_FOLLOW_UP,Client is asking to reschedule demo,,,

2026-05-13 14:25:30,Sarah Johnson,sarah.johnson@example.com,+91,9876543211,Tech Solutions,Bangalore,Karnataka,India,test@gmail.com,DID_NOT_CONNECT,"Person was busy, will try again next week",,,

2026-05-13 14:30:15,Rajesh Patel,rajesh.patel@example.com,+91,9876543212,Startup Inc,Delhi,Delhi,India,test@gmail.com,BAD_LEAD,Not interested in our services,,,

2026-05-13 14:35:22,Priya Singh,priya.singh@example.com,+91,9876543213,Enterprise Corp,Pune,Maharashtra,India,test@gmail.com,SALE_DONE,"Deal closed, onboarding in progress",,,


AI Instructions
Your AI should follow these rules while extracting records.
1. Allowed CRM Status Values
Only use one of:
GOOD_LEAD_FOLLOW_UP
DID_NOT_CONNECT
BAD_LEAD
SALE_DONE

2. Allowed Data Source Values
Only use one of:
leads_on_demand
meridian_tower
eden_park
varah_swamy
sarjapur_plots
If none match confidently, leave it blank.

3. Date Format
created_at must be convertible using JavaScript:
new Date(created_at)


4. CRM Notes
Use crm_note for:
Remarks
Follow-up notes
Additional comments
Extra phone numbers
Extra email addresses
Any useful information that doesn't fit another field

5. Multiple Emails or Mobile Numbers
If multiple email addresses exist:
Use the first email.
Append remaining emails into crm_note.
If multiple mobile numbers exist:
Use the first mobile.
Append remaining numbers into crm_note.

6. CSV Compatibility
Each record must remain a single CSV row.
Avoid introducing unintended line breaks.
If line breaks are necessary, escape them appropriately (for example, \n) so the CSV remains valid.

7. Skip Invalid Records
If a record contains neither:
email
nor
mobile number
then skip that record.

Evaluation Criteria
Candidates will primarily be evaluated on the following:
AI Prompt Engineering
Ability to extract fields accurately
Intelligent field mapping
Handling messy datasets
Handling ambiguous columns

Backend Quality
API design
Clean architecture
Error handling
Batch processing
Maintainable code

Frontend Quality
Modern UI
Responsive layout
Clean UX
CSV preview experience
Loading states
Error handling

Code Quality
Readability
Type safety
Folder structure
Reusability
Best practices

Overall Engineering
Performance
Edge case handling
Production readiness

Bonus Points
Additional credit will be given for implementing:
Drag & Drop upload
Progress indicators during AI processing
Streaming or incremental parsing
Retry mechanism for failed AI batches
Virtualized table for large CSVs
Dark mode
Unit tests
Docker setup
Deployment using Vercel, Railway, Render, or similar platforms
Well-written README with setup instructions

Tech Stack
Frontend
Next.js
Backend
Node.js
Express
AI
OpenAI
Gemini
Claude
Any equivalent LLM
Database (Optional)
Use any database if required, or keep the project stateless.

Final Submission Checklist
Before submitting, ensure you have included:
Publicly hosted application
Public GitHub repository
README containing setup instructions
Position applied for (Intern / Full-Time)
Email everything to:
varun@groweasy.ai
We look forward to reviewing your submission. Good luck!

Screenshots for Reference





