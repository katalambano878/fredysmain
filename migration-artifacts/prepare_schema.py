#!/usr/bin/env python3
"""Prepare Supabase schema SQL for plain Postgres staging restore."""
from pathlib import Path
import re

src = Path("/Users/dr.barns/Documents/Websites/raymahomes/supabase/migrations/20260209000000_complete_schema.sql")
out = Path("/Users/dr.barns/Documents/Websites/raymahomes/migration-artifacts/dumps/schema_plain.sql")

text = src.read_text()

# Split into function defs vs rest so tables/enums exist before functions that reference table types
func_blocks = []

def extract_functions(s: str):
    """Move CREATE FUNCTION ... $$ ... $$; blocks to the end."""
    pattern = re.compile(
        r"CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?\$\$;",
        re.IGNORECASE,
    )
    blocks = pattern.findall(s)
    cleaned = pattern.sub("\n-- (function moved to end)\n", s)
    return cleaned, blocks

header = """
-- Plain Postgres adapted schema (staging)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS \"pgcrypto\" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS \"pgcrypto\" WITH SCHEMA public;
"""

# Remove original extension line (we'll use header)
text = re.sub(
    r'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;',
    "-- extension handled in header",
    text,
)

body, funcs = extract_functions(text)

# Also move CREATE TRIGGER after functions
# Keep triggers with the function section

extra_alters = """
-- Columns added after original schema dump (wholesale feature)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_wholesaler boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wholesale_approved_at timestamptz;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_wholesale boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_price numeric(12,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_moq integer DEFAULT 1;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'retail';
"""

final = header + "\n" + body + "\n-- ===== FUNCTIONS (after tables) =====\n" + "\n\n".join(funcs) + "\n" + extra_alters
out.write_text(final)
print(f"Wrote {out} ({len(final)} bytes, {len(funcs)} functions)")
