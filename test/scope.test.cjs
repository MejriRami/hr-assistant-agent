'use strict';
// Data-scope tests: the tools are called exactly as the model calls them, as each user.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const createChatbotApi = require('../src/chatbot.cjs');
const { DEMO_USERS } = require('../src/server.cjs');
const scope = require('../src/tenantScope.cjs');

const HAS_DB = Boolean(process.env.DATABASE_URL);
let pool;
let tools;

before(() => {
  if (!HAS_DB) return;
  execFileSync(process.execPath, [path.join(__dirname, '..', 'db', 'seed.cjs')], { stdio: 'ignore' });
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  tools = createChatbotApi({ pool, authenticateToken: (req, res, next) => next() }).tools;
});
after(async () => pool && pool.end());

// ---- pure scoping rules (no database) -----------------------------------------

test('each user is mapped to the right tenant schema', () => {
  assert.equal(scope.getSchemaForUser(DEMO_USERS.france), 'schema_fr');
  assert.equal(scope.getSchemaForUser(DEMO_USERS.suzhou), 'schema_cn');
  assert.equal(scope.getAccessibleEmployeeSchemas(DEMO_USERS.group).length, 9);
  assert.deepEqual(scope.getAccessibleEmployeeSchemas(DEMO_USERS.france), ['schema_fr']);
});

test('a plant-level account is restricted to its own site', () => {
  assert.deepEqual(scope.getUserSiteScope(DEMO_USERS.suzhou), ['Site-Suzhou']);
  assert.equal(scope.getUserSiteScope(DEMO_USERS.group), null);
});

test('no tool exposes payroll or salaries', () => {
  const fake = createChatbotApi({ pool: null, authenticateToken: (q, s, n) => n() });
  assert.ok(Object.keys(fake.tools).every((name) => !/salar|paie|payroll|wage/i.test(name)));
});

// ---- tools against the fictional database ---------------------------------------

test('group HR sees every tenant', { skip: !HAS_DB && 'needs DATABASE_URL' }, async () => {
  const { total } = await tools.count_employees(DEMO_USERS.group, {});
  assert.equal(total, 13);
});

test('France HR only sees French employees', { skip: !HAS_DB && 'needs DATABASE_URL' }, async () => {
  const res = await tools.search_employees(DEMO_USERS.france, {});
  assert.equal(res.employees.length, 4);
  assert.ok(res.employees.every((e) => e.tenant_schema === 'schema_fr'));
});

test('asking for another tenant explicitly does not cross the boundary', { skip: !HAS_DB && 'needs DATABASE_URL' }, async () => {
  // The model (or a prompt injection) asks for Tunisian employee #1 while the user is French HR.
  const res = await tools.get_employee_info(DEMO_USERS.france, { employee_id: 1, tenant_schema: 'public' });
  const employee = res.employee || {};
  assert.notEqual(employee.tenant_schema, 'public');
  assert.notEqual(employee.matricule, 'TN-001');
});

test('plant HR only sees its own site, not the other plant of the same country', { skip: !HAS_DB && 'needs DATABASE_URL' }, async () => {
  const res = await tools.search_employees(DEMO_USERS.suzhou, {});
  assert.deepEqual(res.employees.map((e) => e.site_dep).sort(), ['Site-Suzhou', 'Site-Suzhou']);
  const wuxi = await tools.get_leave_balance(DEMO_USERS.suzhou, { employee_name_or_matricule: 'Wang' });
  assert.equal(wuxi.error, 'not_found');
});

test('requests follow the same scope', { skip: !HAS_DB && 'needs DATABASE_URL' }, async () => {
  const all = await tools.list_demandes(DEMO_USERS.group, {});
  const fr = await tools.list_demandes(DEMO_USERS.france, {});
  assert.equal(all.demandes.length, 5);
  assert.ok(fr.demandes.length === 1 && fr.demandes[0].tenant_schema === 'schema_fr');
});
