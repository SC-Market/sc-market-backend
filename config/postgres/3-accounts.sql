INSERT INTO public.accounts(username, rsi_confirmed, display_name, discord_id, role, official_server_id, discord_thread_channel_id) VALUES ('Khuzdul', true, 'Khuzdul', 122739797646245899, 'admin', 1003056231591727264, 1072580369251041330);

-- Grant execute permission to appropriate roles
SELECT * FROM public.create_contractor(
        'SC Market',           -- p_name
        'SCMarket',           -- p_spectrum_id
        '',                   -- p_description
        1,                    -- p_size
        'https://robertsspaceindustries.com/media/mn582hqzsreo2r/logo/SCMARKET-Logo.png',  -- p_logo_url
        NULL,                 -- p_banner_url (you were missing this)
        'Khuzdul',            -- p_owner_username
        'org',       -- p_kind (changed from 'org' to 'organization')
        NULL,                 -- p_site_url
        NULL,                 -- p_official_server_id
        NULL,                 -- p_discord_thread_channel_id
        ''                    -- p_market_order_template
              );
