# 📋 Order Settings Implementation Plan

## 🎯 Overview
Create a new `order_settings` table to allow organizations and users to configure custom messages that will be automatically sent in order/offer chats when offers are submitted or when offers turn into orders.

## 🗄️ Database Design

### Table Structure: `order_settings`
```sql
CREATE TABLE public.order_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Entity this setting belongs to (either user or contractor)
    entity_type character varying(20) NOT NULL CHECK (entity_type IN ('user', 'contractor')),
    entity_id uuid NOT NULL, -- user_id or contractor_id
    
    -- Setting type
    setting_type character varying(50) NOT NULL CHECK (setting_type IN ('offer_message', 'order_message')),
    
    -- The actual message content
    message_content text NOT NULL DEFAULT '',
    
    -- Whether this setting is enabled
    enabled boolean NOT NULL DEFAULT true,
    
    -- Metadata
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    
    -- Constraints
    CONSTRAINT order_settings_unique_entity_setting UNIQUE (entity_type, entity_id, setting_type)
);

-- Indexes for performance
CREATE INDEX idx_order_settings_entity ON order_settings(entity_type, entity_id);
CREATE INDEX idx_order_settings_type ON order_settings(setting_type);
CREATE INDEX idx_order_settings_enabled ON order_settings(enabled);

-- Comments
COMMENT ON TABLE order_settings IS 'Custom messages for orders and offers';
COMMENT ON COLUMN order_settings.entity_type IS 'Type of entity: user or contractor';
COMMENT ON COLUMN order_settings.entity_id IS 'ID of the user or contractor';
COMMENT ON COLUMN order_settings.setting_type IS 'Type of setting: offer_message or order_message';
COMMENT ON COLUMN order_settings.message_content IS 'The message content to send';
```

## 🔧 Backend Implementation

### 1. TypeScript Interfaces
```typescript
// src/clients/database/db-models.ts
export interface DBOrderSetting {
  id: string
  entity_type: 'user' | 'contractor'
  entity_id: string
  setting_type: 'offer_message' | 'order_message'
  message_content: string
  enabled: boolean
  created_at: Date
  updated_at: Date
}

// src/api/routes/v1/api-models.ts
export interface OrderSetting {
  id: string
  entity_type: 'user' | 'contractor'
  entity_id: string
  setting_type: 'offer_message' | 'order_message'
  message_content: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface CreateOrderSettingRequest {
  setting_type: 'offer_message' | 'order_message'
  message_content: string
  enabled?: boolean
}

export interface UpdateOrderSettingRequest {
  message_content?: string
  enabled?: boolean
}
```

### 2. Database Methods
```typescript
// src/clients/database/knex-db.ts
export class KnexDatabase implements Database {
  // Get order settings for an entity
  async getOrderSettings(entityType: 'user' | 'contractor', entityId: string): Promise<DBOrderSetting[]>
  
  // Get specific order setting
  async getOrderSetting(entityType: 'user' | 'contractor', entityId: string, settingType: 'offer_message' | 'order_message'): Promise<DBOrderSetting | null>
  
  // Create order setting
  async createOrderSetting(setting: Omit<DBOrderSetting, 'id' | 'created_at' | 'updated_at'>): Promise<DBOrderSetting>
  
  // Update order setting
  async updateOrderSetting(id: string, updates: Partial<Pick<DBOrderSetting, 'message_content' | 'enabled'>>): Promise<DBOrderSetting>
  
  // Delete order setting
  async deleteOrderSetting(id: string): Promise<void>
}
```

### 3. API Endpoints
```typescript
// src/api/routes/v1/orders/order-settings.ts

// GET /api/v1/orders/settings - Get current user's order settings
// GET /api/v1/contractors/:contractor_id/settings - Get contractor's order settings (requires manage_orders permission)
// POST /api/v1/orders/settings - Create order setting for current user
// POST /api/v1/contractors/:contractor_id/settings - Create order setting for contractor (requires manage_orders permission)
// PUT /api/v1/orders/settings/:id - Update order setting
// DELETE /api/v1/orders/settings/:id - Delete order setting
```

### 4. Message Integration Points

#### A. Offer Creation Message
```typescript
// In src/api/routes/v1/orders/helpers.ts - createOffer function
export async function createOffer(...) {
  // ... existing code ...
  
  // Send custom offer message if setting exists
  await sendCustomOfferMessage(session, offer)
  
  // ... rest of function ...
}

async function sendCustomOfferMessage(session: DBOfferSession, offer: DBOffer) {
  // Get offer message setting for contractor or assigned user
  const setting = await getRelevantOrderSetting(session, 'offer_message')
  
  if (setting && setting.enabled && setting.message_content.trim()) {
    // Send message to chat
    await database.insertMessage({
      chat_id: session.chat_id,
      content: setting.message_content,
      author: setting.entity_type === 'contractor' 
        ? session.contractor_id 
        : session.assigned_id,
    })
  }
}
```

#### B. Order Creation Message
```typescript
// In src/api/routes/v1/orders/helpers.ts - initiateOrder function
export async function initiateOrder(session: DBOfferSession) {
  // ... existing code ...
  
  // Send custom order message if setting exists
  await sendCustomOrderMessage(order, session)
  
  // ... rest of function ...
}

async function sendCustomOrderMessage(order: DBOrder, session: DBOfferSession) {
  // Get order message setting for contractor or assigned user
  const setting = await getRelevantOrderSetting(session, 'order_message')
  
  if (setting && setting.enabled && setting.message_content.trim()) {
    // Send message to chat
    await database.insertMessage({
      chat_id: order.chat_id,
      content: setting.message_content,
      author: setting.entity_type === 'contractor' 
        ? order.contractor_id 
        : order.assigned_id,
    })
  }
}
```

### 5. Helper Functions
```typescript
// src/api/routes/v1/orders/helpers.ts
async function getRelevantOrderSetting(
  session: DBOfferSession, 
  settingType: 'offer_message' | 'order_message'
): Promise<DBOrderSetting | null> {
  // Priority: contractor setting > assigned user setting
  if (session.contractor_id) {
    const contractorSetting = await database.getOrderSetting('contractor', session.contractor_id, settingType)
    if (contractorSetting) return contractorSetting
  }
  
  if (session.assigned_id) {
    const userSetting = await database.getOrderSetting('user', session.assigned_id, settingType)
    if (userSetting) return userSetting
  }
  
  return null
}
```

## 🎨 Frontend Implementation

### 1. Settings UI Components
```typescript
// src/components/settings/OrderSettings.tsx
export function OrderSettings({ entityType, entityId }: { entityType: 'user' | 'contractor', entityId: string }) {
  // Form for managing offer_message and order_message settings
  // Toggle switches for enabled/disabled
  // Text areas for message content
  // Save/delete functionality
}

// src/pages/settings/OrderSettingsPage.tsx
export function OrderSettingsPage() {
  // User's personal order settings
}

// src/pages/contractor/ContractorOrderSettingsPage.tsx  
export function ContractorOrderSettingsPage() {
  // Contractor's order settings (requires manage_orders permission)
}
```

### 2. API Integration
```typescript
// src/store/orderSettings.ts
export const orderSettingsApi = serviceApi.injectEndpoints({
  endpoints: (builder) => ({
    getOrderSettings: builder.query<OrderSetting[], { entityType: 'user' | 'contractor', entityId: string }>({
      query: ({ entityType, entityId }) => `/orders/settings?entity_type=${entityType}&entity_id=${entityId}`,
    }),
    createOrderSetting: builder.mutation<OrderSetting, CreateOrderSettingRequest>({
      query: (setting) => ({
        url: '/orders/settings',
        method: 'POST',
        body: setting,
      }),
    }),
    updateOrderSetting: builder.mutation<OrderSetting, { id: string } & UpdateOrderSettingRequest>({
      query: ({ id, ...updates }) => ({
        url: `/orders/settings/${id}`,
        method: 'PUT',
        body: updates,
      }),
    }),
    deleteOrderSetting: builder.mutation<void, string>({
      query: (id) => ({
        url: `/orders/settings/${id}`,
        method: 'DELETE',
      }),
    }),
  }),
})
```

## 🔐 Permissions

### User Settings
- Users can manage their own order settings
- No special permissions required

### Contractor Settings
- Requires `manage_orders` permission in contractor
- Only contractor members with this permission can modify contractor order settings

## 📝 Migration Strategy

### 1. Database Migration
```sql
-- scripts/migrations/003_create_order_settings_table.sql
-- Create the order_settings table with proper constraints and indexes
```

### 2. Backward Compatibility
- Existing orders/offers continue to work without custom messages
- Settings are optional - if no setting exists, no custom message is sent
- Default behavior remains unchanged

## 🧪 Testing Strategy

### 1. Unit Tests
- Database methods for CRUD operations
- Message integration functions
- Permission checks

### 2. Integration Tests
- API endpoints for order settings
- Message sending when offers/orders are created
- Permission enforcement

### 3. Manual Testing
- Create offer with custom message
- Create order with custom message
- Test contractor vs user settings priority
- Test enabled/disabled toggles

## 🚀 Implementation Phases

### Phase 1: Database & Backend Core
1. Create database migration
2. Add TypeScript interfaces
3. Implement database methods
4. Create API endpoints

### Phase 2: Message Integration
1. Integrate offer message sending
2. Integrate order message sending
3. Add helper functions
4. Test message flow

### Phase 3: Frontend UI
1. Create settings components
2. Add API integration
3. Implement permission checks
4. Add navigation/routing

### Phase 4: Testing & Polish
1. Comprehensive testing
2. Error handling
3. Documentation
4. Performance optimization

## 💡 Key Design Decisions

1. **Entity Flexibility**: Single table supports both users and contractors
2. **Setting Types**: Extensible enum for different message types
3. **Priority System**: Contractor settings override user settings
4. **Optional Nature**: Settings are completely optional
5. **Permission Model**: Leverages existing contractor permissions
6. **Message Timing**: Messages sent immediately when offers/orders are created

This plan provides a comprehensive foundation for implementing order settings functionality while maintaining backward compatibility and following existing patterns in the codebase.