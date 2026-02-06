-- Migration to split existing allocated lots
-- This converts the old allocation model to the new split-on-allocate model

DO $$
DECLARE
    allocation_record RECORD;
    source_lot RECORD;
    new_lot_id UUID;
BEGIN
    -- Process each active allocation
    FOR allocation_record IN 
        SELECT sa.allocation_id, sa.lot_id, sa.order_id, sa.quantity, sa.status
        FROM stock_allocations sa
        WHERE sa.status = 'active'
        ORDER BY sa.created_at ASC
    LOOP
        -- Get the source lot
        SELECT * INTO source_lot
        FROM stock_lots
        WHERE lot_id = allocation_record.lot_id;

        -- Skip if lot doesn't exist
        IF NOT FOUND THEN
            RAISE NOTICE 'Skipping allocation % - lot % not found', 
                allocation_record.allocation_id, allocation_record.lot_id;
            CONTINUE;
        END IF;

        -- Check if lot has enough quantity
        IF source_lot.quantity_total < allocation_record.quantity THEN
            RAISE NOTICE 'Skipping allocation % - insufficient quantity in lot %', 
                allocation_record.allocation_id, allocation_record.lot_id;
            CONTINUE;
        END IF;

        -- Create new allocated lot (hidden)
        INSERT INTO stock_lots (
            listing_id,
            quantity_total,
            location_id,
            owner_id,
            listed,
            notes,
            created_at,
            updated_at
        ) VALUES (
            source_lot.listing_id,
            allocation_record.quantity,
            source_lot.location_id,
            source_lot.owner_id,
            false, -- Hidden from stock view
            'Split from lot ' || source_lot.lot_id || ' during migration',
            NOW(),
            NOW()
        ) RETURNING lot_id INTO new_lot_id;

        -- Update allocation to point to new lot
        UPDATE stock_allocations
        SET lot_id = new_lot_id
        WHERE allocation_id = allocation_record.allocation_id;

        -- Reduce source lot quantity
        UPDATE stock_lots
        SET quantity_total = quantity_total - allocation_record.quantity,
            updated_at = NOW()
        WHERE lot_id = source_lot.lot_id;

        RAISE NOTICE 'Split allocation % from lot % to new lot %', 
            allocation_record.allocation_id, source_lot.lot_id, new_lot_id;
    END LOOP;

    RAISE NOTICE 'Migration complete';
END $$;
