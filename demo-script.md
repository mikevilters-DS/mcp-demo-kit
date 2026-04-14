# MCP Live Demo Script
## Scenario: A vague Jira ticket comes in → AI investigates the database → writes a fix → commits with ticket ID → documents on Confluence

---

## Pre-demo Setup Checklist

### 1. Start the database (5 minutes before)
```powershell
cd mcp-demo-kit
docker compose up -d

# Verify:
docker compose logs postgres
# Should end with "database system is ready to accept connections"
```

### 2. Make sure your git repo is clean
```powershell
git status
# Should be clean — nothing to commit
```

### 3. Open VS Code
- Open the `mcp-demo-kit` folder in VS Code
- GitHub Copilot extension installed and signed in
- Copilot Chat → switch to **Agent mode**
- Click the **tools icon** — verify `postgres`, `git`, and `atlassian` are green

### 4. Pre-create the Jira ticket
Before the demo, create a ticket manually in your Jira project (e.g., project key `SHOP`):

> **Title:** Customers reporting incorrect order amounts
>
> **Type:** Bug
>
> **Priority:** High
>
> **Description:**
> Several customers have reached out to support saying the amounts
> on their invoices don't match what they expected. One customer
> also received a confirmation for a product that should have been
> out of stock.
>
> We also noticed some weird product entries in the catalog that
> don't seem to belong there.
>
> Can someone investigate the database and figure out what's going on?

Note down the ticket ID (e.g., `SHOP-47`). You'll use this in the first prompt.

> 💡 **Alternative:** If you want to create the ticket live during the demo using MCP, see the "Optional: Create Ticket Live" section at the bottom.

---

## The Demo

### 🎬 OPENING (30 seconds)

> "I've got a bug ticket from support — customers are seeing wrong amounts on their invoices. I'm going to let the AI investigate the database, write a fix, commit it with the ticket reference, and document everything on Confluence. All from VS Code, all through MCP."

**Show:** The `.vscode/mcp.json` file briefly — three servers configured.

---

### 🟠 STEP 1 — Read the Jira ticket and investigate (Atlassian + Postgres MCP)

**Prompt to type:**
```
Read Jira ticket SHOP-47 and analyze what's being reported.
Then investigate our database to find the issues described
in the ticket.
```

*(Replace `SHOP-47` with your actual ticket ID)*

**What happens:**
- AI calls Atlassian MCP → reads the ticket description
- AI then calls Postgres MCP → runs diagnostic queries on its own
- It should find:
  - **2 orders** with totals that don't match their line items (#2 off by €9, #4 off by €10)
  - **1 product** with negative stock (Thunderbolt Cable, stock = -3)
  - **1 junk product** ("Performing Sports Without Falling" — price €0.00, no category)
  - **1 duplicate user** (Sophie Maes with case-different email)

**Presenter note:** "I gave it a vague ticket — 'incorrect amounts' and 'weird product entries' — and it figured out what to look for on its own. It wrote and ran the SQL queries without me asking for specific tables."

---

### 🟢 STEP 2 — Deep dive (Postgres MCP)

If the AI didn't catch everything in step 1, nudge it:

**Prompt to type:**
```
Can you also check for any products that clearly don't belong
in an electronics webshop, and any user data issues like
duplicates?
```

**What happens:** AI runs additional queries and surfaces the "Performing Sports Without Falling" product and the duplicate Sophie Maes user.

**Presenter note:** "The AI is using read-only SQL — it can investigate but can't accidentally break anything. That's by design."

---

### 🔵 STEP 3 — Write a fix script (Code generation)

**Prompt to type:**
```
Based on everything you found, write a SQL migration script
that fixes all the issues:
- Recalculate the correct order totals from the line items
- Remove the junk product that doesn't belong
- Fix the negative stock
- Remove the duplicate user

Save it as src/migrations/fix-SHOP-47.sql

Don't execute it — just write the file.
```

**What happens:** The AI writes a migration script to disk. It should look something like:

```sql
-- SHOP-47: Fix data quality issues found during investigation
BEGIN;

-- 1. Recalculate order totals from line items
UPDATE orders SET order_total = sub.correct_total
FROM (
    SELECT order_id, SUM(quantity * unit_price) AS correct_total
    FROM order_items
    GROUP BY order_id
) sub
WHERE orders.id = sub.order_id
  AND orders.order_total != sub.correct_total;

-- 2. Fix negative stock (Thunderbolt Cable, product #8)
UPDATE products SET stock = 0 WHERE id = 8 AND stock < 0;

-- 3. Remove junk product that doesn't belong in catalog
DELETE FROM products
WHERE name = 'Performing Sports Without Falling';

-- 4. Remove duplicate user (keep original lower ID)
DELETE FROM users WHERE id = 7;

COMMIT;
```

**Presenter note:** Open the generated file in the editor. "The AI wrote a transactional migration based on its investigation. In a real workflow, you'd review this and test on staging first. Let's commit it."

---

### 🔵 STEP 4 — Commit with Jira ticket reference (Git MCP)

**Prompt to type:**
```
Stage and commit the migration script we just created.
Write a conventional commit message that references SHOP-47
in the message. Don't push.
```

**What happens:** AI stages the file and commits with something like:

```
fix(db): correct order totals and clean up invalid data (SHOP-47)

- Recalculate order totals for orders #2 and #4 to match line items
- Reset negative stock for Thunderbolt Cable (product #8)
- Remove invalid product "Performing Sports Without Falling"
- Remove duplicate user entry (case-different email)

Resolves: SHOP-47
```

**Presenter note:** Run `git log -1` in the terminal to show the commit. "The commit references SHOP-47 — Jira will auto-link this if your repo is connected. The AI wrote the message based on what it actually fixed, not a generic description."

---

### 🟠 STEP 5 — Document on Confluence (Atlassian MCP)

**Prompt to type:**
```
Create a Confluence page in the SHOP space documenting this
investigation. Title: "SHOP-47: Order Total Mismatch — Root Cause
and Fix". Include:
- What the original ticket reported
- What we found in the database (list all issues with specifics)
- What the migration script does
- Recommendations to prevent this in the future
```

**What happens:** The AI creates a Confluence page pulling together the full story — ticket context, database findings, fix details, and prevention advice.

**Presenter note:** "Everything from this conversation is now documented. New team members can read this page and understand exactly what happened and why."

---

### 🟠 STEP 6 (Optional) — Update the Jira ticket (Atlassian MCP)

**Prompt to type:**
```
Add a comment to SHOP-47 summarizing the investigation and
the fix that was committed. Mention that documentation was
added to Confluence.
```

**What happens:** The AI adds a structured comment to the Jira ticket closing the loop.

---

### 🎬 CLOSING (1 minute)

> "Let's recap. A vague support ticket came in. The AI read it through Atlassian MCP, investigated the database through Postgres MCP, found four different issues, wrote a migration script, committed it with the ticket ID through Git MCP, documented everything on Confluence, and updated the Jira ticket. Six prompts, three MCP servers, zero context switching.
>
> The whole setup is one JSON file — `.vscode/mcp.json` — that you commit to your repo so every teammate gets the same tools automatically."

---

## Optional: Create the Ticket Live

If you want to skip pre-creating the ticket and do it live:

**Prompt to type at the very start:**
```
Create a Bug ticket in Jira project SHOP with high priority.
Title: "Customers reporting incorrect order amounts"
Description: Several customers have reached out to support saying
the amounts on their invoices don't match what they expected.
One customer also received a confirmation for a product that
should have been out of stock. We also noticed some weird product
entries in the catalog that don't seem to belong there. Can
someone investigate the database and figure out what's going on?
```

Then use whatever ticket ID it returns for the rest of the demo.

---

## Backup Prompts (if Atlassian fails)

Skip straight to investigating the database:

```
Investigate our webshop database for data quality issues.
Check for order total mismatches, invalid product entries,
negative stock values, and duplicate users. Report everything
you find.
```

The Postgres + Git parts of the demo work perfectly without Atlassian.

---

## Cleanup After Demo

```powershell
docker compose down -v
git reset --hard HEAD~1    # removes the migration commit
```