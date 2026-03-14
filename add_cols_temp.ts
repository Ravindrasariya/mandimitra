import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    ALTER TABLE transactions 
    ADD COLUMN IF NOT EXISTS extra_tulai_farmer DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS extra_bharai_farmer DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS extra_khadi_karai_farmer DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS extra_thela_bhada_farmer DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS extra_others_farmer DECIMAL(10,2) DEFAULT 0
  `;
  console.log('Columns added successfully');
}

main().catch(console.error);
