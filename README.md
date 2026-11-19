# HR Assistant Agent: tool calling with per-user, per-tenant data scoping

The conversational assistant of a multi-entity HR platform (9 country subsidiaries, one PostgreSQL schema per country). HR staff ask questions in natural language; the model answers by calling **8 whitelisted tools**, and every tool enforces the asking user's data scope.

**▶ [Video: the full HR platform this assistant lives in, with the assistant answering live (French, ~4 min)](https://github.com/MejriRami/MejriRami/releases/download/platforms/Plateforme_RH.mp4)** · anonymized copy, fictional names

> **Résumé (FR)** : assistant RH conversationnel (function calling) intégré à une plateforme RH multi-filiales. Le modèle n'écrit jamais de SQL : il appelle 8 outils, et chaque outil applique les droits de l'utilisateur authentifié (pays, site). Pas d'outil de paie. Extrait d'un projet livré en entreprise ; données fictives.

![tests](https://github.com/MejriRami/hr-assistant-agent/actions/workflows/tests.yml/badge.svg)

## Design

- **The model never writes SQL.** It can only call: `search_employees`, `count_employees`, `list_sites`, `get_current_tenant`, `get_employee_info`, `get_leave_balance`, `list_demandes`, `get_demande_status`.
- **Identity comes from the verified token, never from the conversation.** Each tool receives `req.user` from the JWT, so a user (or a prompt injection) cannot claim another country or site.
- **Scope is enforced in the tools**, with the same rules as the platform's REST endpoints (`src/tenantScope.cjs`):
  - group HR → all 9 country schemas;
  - country HR → its own schema only;
  - plant HR → its own sites only, inside its country.
- **Deliberately missing tools.** There is no payroll or salary tool, and the assistant is read-only: it explains where to approve a request instead of doing it.
- **Context-aware prompt.** The system prompt is built per request with the user's role, tenant, scope and today's date, so *"which site am I on?"* and *"last month"* are answered correctly.
- **Bounded loop.** At most 4 tool-calling iterations, and the last 20 history messages.

```
 Browser ── JWT ──► Express ──► /api/chatbot/message
                                   │  system prompt built from req.user
                                   ▼
                     OpenAI chat completions (tools, auto)
                                   │ tool calls
                                   ▼
          8 tools ── tenantScope(req.user) ──► PostgreSQL: public · schema_fr · schema_cn · … (9 schemas)
```

## Tests: proving the boundary

`test/scope.test.cjs` calls the tools **exactly as the model does**, as each user:

| Test | Checks |
|---|---|
| group HR sees every tenant | 13 employees across 3 populated countries |
| France HR only sees French employees | every row is from `schema_fr` |
| **asking for another tenant explicitly does not cross the boundary** | France HR requesting Tunisian employee #1 with `tenant_schema: "public"` gets nothing from Tunisia |
| plant HR only sees its own site | Suzhou HR does not see the Wuxi plant of the same country, and gets `not_found` for a Wuxi employee's leave balance |
| requests follow the same scope | 5 requests for group HR, 1 for France |
| no tool exposes payroll | tool names checked |

```bash
npm install
createdb hr_demo
DATABASE_URL=postgresql://user:pass@localhost:5432/hr_demo npm test     # 8 passed
```

Without `DATABASE_URL`, the pure scoping tests run and the database tests are skipped. CI runs everything against a PostgreSQL service.

## Run the demo

```bash
cp .env.example .env          # DATABASE_URL, OPENAI_API_KEY, JWT_SECRET
npm run seed                  # fictional company: 13 employees in Tunisia, France, China
npm start                     # http://localhost:3100
```

Switch between the three demo users in the header and ask the same question, *"How many active employees can I see?"*, to watch the scope change. Ask for a salary to see the refusal.

---

*Extracted from an HR platform built at my current employer; company, sites and people are fictional.*
