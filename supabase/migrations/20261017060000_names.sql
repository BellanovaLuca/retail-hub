-- Omonimi (§3): il nome visualizzato è univoco anche ignorando gli spazi in più
-- ("Fra  R." = "Fra R."), e la sigla di colonna del foglio orario è univoca.

create unique index profiles_display_name_norm_key
  on public.profiles (lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')));

create unique index profiles_short_label_key
  on public.profiles (upper(short_label))
  where short_label is not null;
