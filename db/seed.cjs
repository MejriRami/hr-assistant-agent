'use strict';
// Creates the schema and fills three tenants with FICTIONAL employees and requests.
//   DATABASE_URL=postgresql://user:pass@localhost:5432/hr_demo node db/seed.cjs
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const TENANTS = {
  public: [ // Tunisia
    ['TN-001', 'Trabelsi', 'Sami', 'Plant Manager', 'Site-Tunis', '1984-03-12', '2015-09-01', 24.5],
    ['TN-002', 'Gharbi', 'Ines', 'Quality Engineer', 'Site-Tunis', '1995-07-22', '2021-02-15', 11.0],
    ['TN-003', 'Kacem', 'Mehdi', 'Production Supervisor', 'Site-Tunis', '1990-11-05', '2018-06-11', 6.5],
    ['TN-004', 'Ben Salah', 'Youssef', 'Group Quality Director', 'Qualité', '1979-01-30', '2012-01-09', 30.0],
    ['TN-005', 'Mansour', 'Amel', 'HR Officer', 'Ressources Humaines', '1998-04-18', '2024-03-04', 4.0],
  ],
  schema_fr: [ // France
    ['FR-101', 'Martin', 'Claire', 'Chief Executive Officer', 'Site-Lyon', '1972-05-14', '2010-04-01', 18.0],
    ['FR-102', 'Petit', 'Laura', 'HR Manager', 'Site-Lyon', '1986-09-03', '2016-10-17', 21.5],
    ['FR-103', 'Durand', 'Hugo', 'Maintenance Technician', 'Site-Nantes', '1993-12-01', '2020-01-06', 9.0],
    ['FR-104', 'Moreau', 'Julie', 'Buyer', 'Site-Nantes', '1999-02-27', '2025-05-12', 3.5],
  ],
  schema_cn: [ // China
    ['CN-201', 'Zhang', 'Wei', 'Plant Manager', 'Site-Suzhou', '1981-08-08', '2014-07-01', 15.0],
    ['CN-202', 'Li', 'Na', 'Quality Engineer', 'Site-Suzhou', '1994-06-16', '2019-03-18', 7.0],
    ['CN-203', 'Wang', 'Lei', 'Logistics Coordinator', 'Site-Wuxi', '1991-10-10', '2017-11-20', 12.0],
    ['CN-204', 'Chen', 'Mei', 'Process Engineer', 'Site-Wuxi', '1997-03-29', '2023-08-07', 5.0],
  ],
};

const REQUESTS = [ // [tenant, employee index, type, status, from, to]
  ['public', 1, 'congé', 'approuve', '2026-12-21', '2026-12-31'],
  ['public', 2, 'autorisation_absence', 'en_attente', '2026-11-25', '2026-11-25'],
  ['schema_fr', 2, 'congé', 'en_attente', '2026-12-22', '2027-01-02'],
  ['schema_cn', 1, 'mission', 'approuve', '2026-12-01', '2026-12-05'],
  ['schema_cn', 3, 'congé', 'refuse', '2026-11-20', '2026-11-27'],
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const ids = {};
  for (const [schema, rows] of Object.entries(TENANTS)) {
    await client.query(`TRUNCATE ${schema}.demande_rh, ${schema}.leave_balances, ${schema}.employees RESTART IDENTITY CASCADE`);
    ids[schema] = [];
    for (const [matricule, nom, prenom, poste, site, birth, hired, balance] of rows) {
      const email = `${prenom}.${nom}`.toLowerCase().replace(/\s+/g, '') + '@northwind.example';
      const { rows: [r] } = await client.query(
        `INSERT INTO ${schema}.employees (matricule, nom, prenom, poste, site_dep, adresse_mail, date_naissance, date_debut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [matricule, nom, prenom, poste, site, email, birth, hired]);
      ids[schema].push(r.id);
      await client.query(`INSERT INTO ${schema}.leave_balances (employee_id, balance) VALUES ($1,$2)`, [r.id, balance]);
    }
  }
  for (const [schema, idx, type, status, from, to] of REQUESTS) {
    await client.query(`INSERT INTO ${schema}.demande_rh (employe_id, type_demande, statut, date_depart, date_retour) VALUES ($1,$2,$3,$4,$5)`,
      [ids[schema][idx], type, status, from, to]);
  }
  await client.end();
  console.log(`seeded: ${Object.values(TENANTS).flat().length} employees in 3 tenants, ${REQUESTS.length} requests`);
}

main().catch((e) => { console.error(e); process.exit(1); });
