WITH legacy AS (
  SELECT slug, substr(password, 13) AS verifier,
    instr(substr(password, 13), ':') AS separator
  FROM links
  WHERE password GLOB 'sink-pwd:v1:*'
)
UPDATE links
SET password = 'sink-pwd:v2:' || (
  SELECT substr(verifier, 1, separator + 66)
  FROM legacy
  WHERE legacy.slug = links.slug
)
WHERE slug IN (
  SELECT slug
  FROM legacy
  WHERE separator BETWEEN 2 AND 7
    AND substr(verifier, separator + 23, 1) = ':'
    AND substr(verifier, separator + 67, 1) = ':'
);
