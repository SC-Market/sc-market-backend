CREATE TABLE IF NOT EXISTS shops(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    description varchar(100) NOT NULL,
    -- location varchar(100) NOT NULL,
    banner UUID REFERENCES image_resources(resource_id),
    logo UUID REFERENCES image_resources(resource_id),
)