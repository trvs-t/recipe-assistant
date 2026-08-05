-- Allow a recipe ingredient to keep a named alternative with its own amount.

ALTER TABLE ingredients
    ADD COLUMN variation_of_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
    ADD CONSTRAINT ingredients_variation_not_self
        CHECK (variation_of_id IS NULL OR variation_of_id <> id);

CREATE INDEX idx_ingredients_variation_of_id
    ON ingredients(variation_of_id);
