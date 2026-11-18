-- Multi-tenant HR schema used by the assistant's tools: one PostgreSQL schema per
-- country tenant, same tables in each (simplified to the columns the tools read).
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','schema_tn','schema_fr','schema_cn','schema_de','schema_in','schema_lu','schema_mx','schema_kr'] LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', s);
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.employees (
        id               serial PRIMARY KEY,
        matricule        text NOT NULL,
        nom              text NOT NULL,
        prenom           text NOT NULL,
        poste            text,
        site_dep         text,
        statut           text DEFAULT 'actif',
        adresse_mail     text,
        date_naissance   date,
        date_debut       date,
        date_fin_contrat date
      )$t$, s);
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.leave_balances (
        employee_id integer PRIMARY KEY REFERENCES %I.employees(id),
        balance     numeric(6,2) NOT NULL,
        updated_at  timestamptz DEFAULT now()
      )$t$, s, s);
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.demande_rh (
        id                serial PRIMARY KEY,
        employe_id        integer REFERENCES %I.employees(id),
        type_demande      text NOT NULL,
        statut            text NOT NULL DEFAULT 'en_attente',
        date_depart       date,
        date_retour       date,
        commentaire_refus text,
        created_at        timestamptz DEFAULT now()
      )$t$, s, s);
  END LOOP;
END $$;
