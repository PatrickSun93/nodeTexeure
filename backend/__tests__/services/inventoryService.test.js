const InventoryService = require('../../services/inventoryService')
const db = require('../../utils/database')

jest.mock('../../utils/database')

describe('InventoryService', () => {
  let inventoryService

  beforeEach(() => {
    inventoryService = new InventoryService()
    jest.clearAllMocks()
  })

  describe('checkStock', () => {
    it('should return available stock for a product', async () => {
      const mockStock = [{ stock_quantity: 10, reserved_quantity: 2 }]
      db.query.mockResolvedValue(mockStock)

      const result = await inventoryService.checkStock('PROD001')

      expect(db.query).toHaveBeenCalledWith(
        'SELECT stock_quantity, reserved_quantity FROM products WHERE id = ?',
        ['PROD001']
      )

      expect(result).toEqual({
        success: true,
        available: 8,
        total: 10,
        reserved: 2
      })
    })

    it('should handle product not found', async () => {
      db.query.mockResolvedValue([])

      const result = await inventoryService.checkStock('NONEXISTENT')

      expect(result).toEqual({
        success: false,
        error: 'Product not found'
      })
    })
  })

  describe('reserveStock', () => {
    it('should reserve stock successfully', async () => {
      const items = [
        { productId: 'PROD001', quantity: 2 },
        { productId: 'PROD002', quantity: 1 }
      ]

      // Mock stock check
      db.query
        .mockResolvedValueOnce([{ stock_quantity: 10, reserved_quantity: 2 }]) // PROD001
        .mockResolvedValueOnce([{ stock_quantity: 5, reserved_quantity: 0 }])  // PROD002

      // Mock reservation creation
      db.query.mockResolvedValueOnce({ insertId: 'RES001' })

      // Mock stock update
      db.query.mockResolvedValue({ affectedRows: 1 })

      const result = await inventoryService.reserveStock(items, 'ORDER001', 3600)

      expect(result).toEqual({
        success: true,
        reservationId: 'RES001',
        expiresAt: expect.any(Date)
      })
    })

    it('should fail when insufficient stock', async () => {
      const items = [{ productId: 'PROD001', quantity: 10 }]

      // Mock insufficient stock
      db.query.mockResolvedValueOnce([{ stock_quantity: 5, reserved_quantity: 2 }])

      const result = await inventoryService.reserveStock(items, 'ORDER001', 3600)

      expect(result).toEqual({
        success: false,
        error: 'Insufficient stock for product PROD001. Available: 3, Requested: 10'
      })
    })

    it('should handle database errors during reservation', async () => {
      const items = [{ productId: 'PROD001', quantity: 2 }]

      db.query.mockRejectedValue(new Error('Database connection failed'))

      const result = await inventoryService.reserveStock(items, 'ORDER001', 3600)

      expect(result).toEqual({
        success: false,
        error: 'Database connection failed'
      })
    })
  })

  describe('releaseReservation', () => {
    it('should release reservation successfully', async () => {
      const mockReservation = [{
        id: 'RES001',
        items: JSON.stringify([
          { productId: 'PROD001', quantity: 2 },
          { productId: 'PROD002', quantity: 1 }
        ])
      }]

      db.query
        .mockResolvedValueOnce(mockReservation) // Get reservation
        .mockResolvedValue({ affectedRows: 1 })  // Update operations

      const result = await inventoryService.releaseReservation('RES001')

      expect(result).toEqual({
        success: true,
        message: 'Reservation released successfully'
      })
    })

    it('should handle reservation not found', async () => {
      db.query.mockResolvedValueOnce([])

      const result = await inventoryService.releaseReservation('NONEXISTENT')

      expect(result).toEqual({
        success: false,
        error: 'Reservation not found'
      })
    })
  })

  describe('updateStock', () => {
    it('should update stock successfully', async () => {
      db.query.mockResolvedValue({ affectedRows: 1 })

      const result = await inventoryService.updateStock('PROD001', 5, 'RESTOCK', 'Manual adjustment')

      expect(db.query).toHaveBeenCalledWith(
        'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
        [5, 'PROD001']
      )

      expect(result).toEqual({
        success: true,
        message: 'Stock updated successfully'
      })
    })

    it('should prevent negative stock', async () => {
      const mockStock = [{ stock_quantity: 2 }]
      db.query.mockResolvedValueOnce(mockStock)

      const result = await inventoryService.updateStock('PROD001', -5, 'SALE', 'Order fulfillment')

      expect(result).toEqual({
        success: false,
        error: 'Insufficient stock. Available: 2, Requested: 5'
      })
    })

    it('should log inventory movements', async () => {
      db.query.mockResolvedValue({ affectedRows: 1 })

      await inventoryService.updateStock('PROD001', 5, 'RESTOCK', 'Manual adjustment')

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO inventory_movements'),
        expect.arrayContaining(['PROD001', 5, 'RESTOCK', 'Manual adjustment'])
      )
    })
  })

  describe('getLowStockProducts', () => {
    it('should return products with low stock', async () => {
      const mockLowStock = [
        { id: 'PROD001', name: 'Product 1', stock_quantity: 2, reorder_point: 5 },
        { id: 'PROD002', name: 'Product 2', stock_quantity: 1, reorder_point: 3 }
      ]

      db.query.mockResolvedValue(mockLowStock)

      const result = await inventoryService.getLowStockProducts()

      expect(db.query).toHaveBeenCalledWith(
        'SELECT id, name, stock_quantity, reorder_point FROM products WHERE stock_quantity <= reorder_point AND is_active = 1'
      )

      expect(result).toEqual({
        success: true,
        products: mockLowStock
      })
    })
  })

  describe('getInventoryMovements', () => {
    it('should return inventory movements with filters', async () => {
      const mockMovements = [
        {
          id: 'MOV001',
          product_id: 'PROD001',
          quantity_change: 5,
          movement_type: 'RESTOCK',
          created_at: new Date()
        }
      ]

      db.query.mockResolvedValue(mockMovements)

      const result = await inventoryService.getInventoryMovements({
        productId: 'PROD001',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      })

      expect(result).toEqual({
        success: true,
        movements: mockMovements
      })
    })
  })
})