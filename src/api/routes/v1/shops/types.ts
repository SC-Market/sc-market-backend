export interface DBShop {
  id: number
  slug: string
  name: string
  description: string
  banner: string
  logo: string
  contractor_id: string
  user_id: string
}

export interface DBStorageLocation {
  id: number
  name: string
  description: string
  shop_id: string
  user_id: string
}

export interface DBMarketInventory {
  item_id: string
  shop_id: number
  possessor: string
  location: string
  quantity: number
}
