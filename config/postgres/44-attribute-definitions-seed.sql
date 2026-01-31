-- Migration: Seed initial attribute definitions
-- This migration populates the attribute_definitions table with initial attribute schema
-- for components, armor, and weapons

-- Component attributes
-- Size attribute (0-12 for ship components)
INSERT INTO public.attribute_definitions (
    attribute_name,
    display_name,
    attribute_type,
    allowed_values,
    applicable_item_types,
    display_order
) VALUES (
    'size',
    'Component Size',
    'select',
    ARRAY['0','1','2','3','4','5','6','7','8','9','10','11','12'],
    ARRAY['Quantum Drive', 'Cooler', 'Power Plant', 'Shield', 'Ship Weapon', 'Ship Turret or Gimbal', 'Mining Head', 'Salvage Head', 'Towing Beam', 'Fuel Pod', 'Fuel Nozzle', 'Jump Drive', 'Flight Blade', 'Bomb Launcher', 'Ship Module'],
    10
) ON CONFLICT (attribute_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    attribute_type = EXCLUDED.attribute_type,
    allowed_values = EXCLUDED.allowed_values,
    applicable_item_types = EXCLUDED.applicable_item_types,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Component class attribute
INSERT INTO public.attribute_definitions (
    attribute_name,
    display_name,
    attribute_type,
    allowed_values,
    applicable_item_types,
    display_order
) VALUES (
    'class',
    'Component Class',
    'multiselect',
    ARRAY['Military', 'Stealth', 'Industrial', 'Civilian', 'Competition'],
    ARRAY['Quantum Drive', 'Cooler', 'Power Plant', 'Shield', 'Jump Drive'],
    20
) ON CONFLICT (attribute_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    attribute_type = EXCLUDED.attribute_type,
    allowed_values = EXCLUDED.allowed_values,
    applicable_item_types = EXCLUDED.applicable_item_types,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Component grade attribute
INSERT INTO public.attribute_definitions (
    attribute_name,
    display_name,
    attribute_type,
    allowed_values,
    applicable_item_types,
    display_order
) VALUES (
    'grade',
    'Component Grade',
    'multiselect',
    ARRAY['A', 'B', 'C', 'D'],
    ARRAY['Quantum Drive', 'Cooler', 'Power Plant', 'Shield', 'Ship Weapon', 'Jump Drive'],
    30
) ON CONFLICT (attribute_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    attribute_type = EXCLUDED.attribute_type,
    allowed_values = EXCLUDED.allowed_values,
    applicable_item_types = EXCLUDED.applicable_item_types,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Manufacturer attribute (free-form text for flexibility)
INSERT INTO public.attribute_definitions (
    attribute_name,
    display_name,
    attribute_type,
    allowed_values,
    applicable_item_types,
    display_order
) VALUES (
    'manufacturer',
    'Manufacturer',
    'text',
    NULL,
    ARRAY['Quantum Drive', 'Cooler', 'Power Plant', 'Shield', 'Ship Weapon', 'Ship Turret or Gimbal', 'Missile', 'Missile Rack', 'Bomb', 'Mining Head', 'Salvage Head', 'Towing Beam', 'Fuel Pod', 'Fuel Nozzle', 'Jump Drive', 'Flight Blade', 'Bomb Launcher', 'Ship Module', 'Ranged Weapon', 'Melee Weapon', 'FPS Tool', 'Tractor Beam', 'Thrown Weapon', 'Flare'],
    40
) ON CONFLICT (attribute_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    attribute_type = EXCLUDED.attribute_type,
    allowed_values = EXCLUDED.allowed_values,
    applicable_item_types = EXCLUDED.applicable_item_types,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Armor attributes
-- Armor type attribute
INSERT INTO public.attribute_definitions (
    attribute_name,
    display_name,
    attribute_type,
    allowed_values,
    applicable_item_types,
    display_order
) VALUES (
    'armor_type',
    'Armor Type',
    'multiselect',
    ARRAY['Light', 'Medium', 'Heavy'],
    ARRAY['Helmet', 'Torso', 'Arms', 'Legs', 'Full Set', 'Undersuit', 'Backpack'],
    50
) ON CONFLICT (attribute_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    attribute_type = EXCLUDED.attribute_type,
    allowed_values = EXCLUDED.allowed_values,
    applicable_item_types = EXCLUDED.applicable_item_types,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Armor color attribute (free-form for flexibility)
INSERT INTO public.attribute_definitions (
    attribute_name,
    display_name,
    attribute_type,
    allowed_values,
    applicable_item_types,
    display_order
) VALUES (
    'color',
    'Color',
    'text',
    NULL,
    ARRAY['Helmet', 'Torso', 'Arms', 'Legs', 'Full Set', 'Undersuit', 'Backpack'],
    60
) ON CONFLICT (attribute_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    attribute_type = EXCLUDED.attribute_type,
    allowed_values = EXCLUDED.allowed_values,
    applicable_item_types = EXCLUDED.applicable_item_types,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Weapon attributes
-- Weapon type attribute
INSERT INTO public.attribute_definitions (
    attribute_name,
    display_name,
    attribute_type,
    allowed_values,
    applicable_item_types,
    display_order
) VALUES (
    'weapon_type',
    'Weapon Type',
    'multiselect',
    ARRAY['Ballistic', 'Laser', 'Energy', 'Missile', 'Melee', 'Plasma', 'Distortion'],
    ARRAY['Ranged Weapon', 'Melee Weapon', 'Ship Weapon', 'Missile', 'Thrown Weapon'],
    70
) ON CONFLICT (attribute_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    attribute_type = EXCLUDED.attribute_type,
    allowed_values = EXCLUDED.allowed_values,
    applicable_item_types = EXCLUDED.applicable_item_types,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Weapon category attribute (FPS vs Ship vs Vehicle)
INSERT INTO public.attribute_definitions (
    attribute_name,
    display_name,
    attribute_type,
    allowed_values,
    applicable_item_types,
    display_order
) VALUES (
    'weapon_category',
    'Weapon Category',
    'select',
    ARRAY['FPS', 'Ship', 'Vehicle'],
    ARRAY['Ranged Weapon', 'Melee Weapon', 'Ship Weapon', 'Missile', 'Thrown Weapon', 'FPS Tool', 'Tractor Beam', 'Flare'],
    80
) ON CONFLICT (attribute_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    attribute_type = EXCLUDED.attribute_type,
    allowed_values = EXCLUDED.allowed_values,
    applicable_item_types = EXCLUDED.applicable_item_types,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

COMMENT ON TABLE public.attribute_definitions IS 'Defines valid attributes and their UI presentation for game items - seeded with initial component, armor, and weapon attributes';
