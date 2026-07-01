const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { validateInput } = require('../middleware/validationMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Initialize content management tables if they don't exist
 */
const initializeContentTables = async () => {
  try {
    // Create pages table
    await DatabaseUtil.executeQuery(`
      CREATE TABLE IF NOT EXISTS pages (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        content LONGTEXT,
        excerpt TEXT,
        status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
        page_type ENUM('page', 'blog') DEFAULT 'page',
        meta_title VARCHAR(255),
        meta_description VARCHAR(500),
        meta_keywords VARCHAR(255),
        featured_image VARCHAR(500),
        author_id VARCHAR(50),
        published_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (author_id) REFERENCES users(id),
        INDEX idx_slug (slug),
        INDEX idx_status (status),
        INDEX idx_page_type (page_type),
        INDEX idx_published_at (published_at),
        FULLTEXT idx_search (title, content, excerpt)
      )
    `);

    // Create menus table
    await DatabaseUtil.executeQuery(`
      CREATE TABLE IF NOT EXISTS menus (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_location (location),
        INDEX idx_active (is_active)
      )
    `);

    // Create menu items table
    await DatabaseUtil.executeQuery(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id VARCHAR(50) PRIMARY KEY,
        menu_id VARCHAR(50) NOT NULL,
        parent_id VARCHAR(50) NULL,
        title VARCHAR(100) NOT NULL,
        url VARCHAR(500),
        target VARCHAR(20) DEFAULT '_self',
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES menu_items(id) ON DELETE CASCADE,
        INDEX idx_menu_id (menu_id),
        INDEX idx_parent_id (parent_id),
        INDEX idx_sort_order (sort_order)
      )
    `);

    // Create banners table
    await DatabaseUtil.executeQuery(`
      CREATE TABLE IF NOT EXISTS banners (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        image_url VARCHAR(500),
        link_url VARCHAR(500),
        link_text VARCHAR(100),
        position ENUM('header', 'footer', 'sidebar', 'homepage', 'category') DEFAULT 'homepage',
        target_audience JSON COMMENT 'Contains: user_roles, categories, pages, conditions',
        display_rules JSON COMMENT 'Contains: start_date, end_date, max_impressions, priority, device_targeting',
        is_active BOOLEAN DEFAULT TRUE,
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (created_by) REFERENCES users(id),
        INDEX idx_position (position),
        INDEX idx_active (is_active),
        INDEX idx_created_by (created_by)
      )
    `);

    // Create media library table
    await DatabaseUtil.executeQuery(`
      CREATE TABLE IF NOT EXISTS media_library (
        id VARCHAR(50) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size INT UNSIGNED,
        mime_type VARCHAR(100),
        width INT UNSIGNED NULL,
        height INT UNSIGNED NULL,
        alt_text VARCHAR(255),
        caption TEXT,
        uploaded_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (uploaded_by) REFERENCES users(id),
        INDEX idx_mime_type (mime_type),
        INDEX idx_uploaded_by (uploaded_by),
        INDEX idx_filename (filename)
      )
    `);

    logger.info('Content management tables initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize content management tables', { error: error.message });
  }
};

// Initialize tables on module load
initializeContentTables();

/**
 * GET /api/admin/content/pages
 * Get all pages with filtering and pagination
 */
router.get('/pages', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = '', 
      type = '', 
      search = '',
      sort = 'created_at',
      order = 'desc'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = ['1=1'];
    let queryParams = [];

    // Status filter
    if (status) {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }

    // Type filter
    if (type) {
      whereConditions.push('page_type = ?');
      queryParams.push(type);
    }

    // Search filter
    if (search) {
      whereConditions.push('(title LIKE ? OR content LIKE ? OR excerpt LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');
    const orderClause = `ORDER BY ${sort} ${order.toUpperCase()}`;

    // Get total count
    const countResult = await DatabaseUtil.executeQuery(
      `SELECT COUNT(*) as total FROM pages WHERE ${whereClause}`,
      queryParams
    );

    // Get pages
    const pagesResult = await DatabaseUtil.executeQuery(
      `SELECT 
        p.*,
        u.first_name,
        u.last_name
       FROM pages p
       LEFT JOIN users u ON p.author_id = u.id
       WHERE ${whereClause}
       ${orderClause}
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), offset]
    );

    if (pagesResult.success) {
      const total = countResult.success ? countResult.data[0].total : 0;
      const totalPages = Math.ceil(total / parseInt(limit));

      const keyValueTable = {
        pages: pagesResult.data,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        filters: { status, type, search, sort, order }
      };

      res.json(ResponseFormatter.success('Pages retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve pages');
    }
  } catch (error) {
    logger.error('Get pages error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get pages', keyValueTable));
  }
});

/**
 * GET /api/admin/content/pages/:id
 * Get specific page by ID
 */
router.get('/pages/:id', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await DatabaseUtil.executeQuery(
      `SELECT 
        p.*,
        u.first_name,
        u.last_name
       FROM pages p
       LEFT JOIN users u ON p.author_id = u.id
       WHERE p.id = ?`,
      [id]
    );

    if (result.success && result.data.length > 0) {
      const keyValueTable = result.data[0];
      res.json(ResponseFormatter.success('Page retrieved successfully', keyValueTable));
    } else {
      const keyValueTable = { error: 'Page not found', pageId: id };
      res.status(404).json(ResponseFormatter.failure('Page not found', keyValueTable));
    }
  } catch (error) {
    logger.error('Get page error', {
      error: error.message,
      pageId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get page', keyValueTable));
  }
});

/**
 * POST /api/admin/content/pages
 * Create new page
 */
router.post('/pages', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const {
      title,
      slug,
      content = '',
      excerpt = '',
      status = 'draft',
      page_type = 'page',
      meta_title = '',
      meta_description = '',
      meta_keywords = '',
      featured_image = ''
    } = req.body;

    if (!title || !slug) {
      const keyValueTable = { error: 'title and slug are required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required fields', keyValueTable));
    }

    // Check if slug already exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM pages WHERE slug = ?',
      [slug]
    );

    if (existingResult.success && existingResult.data.length > 0) {
      const keyValueTable = { error: 'Slug already exists', slug };
      return res.status(400).json(ResponseFormatter.failure('Slug already exists', keyValueTable));
    }

    const pageId = `PAGE${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    const publishedAt = status === 'published' ? new Date() : null;

    const result = await DatabaseUtil.executeQuery(
      `INSERT INTO pages (
        id, title, slug, content, excerpt, status, page_type,
        meta_title, meta_description, meta_keywords, featured_image,
        author_id, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pageId, title, slug, content, excerpt, status, page_type,
        meta_title, meta_description, meta_keywords, featured_image,
        req.user.id, publishedAt
      ]
    );

    if (result.success) {
      logger.info('Page created', {
        pageId,
        title,
        slug,
        createdBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        pageId,
        title,
        slug,
        status,
        createdBy: req.user.id,
        createdAt: new Date().toISOString()
      };

      res.status(201).json(ResponseFormatter.success('Page created successfully', keyValueTable));
    } else {
      throw new Error('Failed to create page');
    }
  } catch (error) {
    logger.error('Create page error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to create page', keyValueTable));
  }
});

/**
 * PUT /api/admin/content/pages/:id
 * Update existing page
 */
router.put('/pages/:id', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      slug,
      content,
      excerpt,
      status,
      page_type,
      meta_title,
      meta_description,
      meta_keywords,
      featured_image
    } = req.body;

    // Check if page exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT * FROM pages WHERE id = ?',
      [id]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Page not found', pageId: id };
      return res.status(404).json(ResponseFormatter.failure('Page not found', keyValueTable));
    }

    const existingPage = existingResult.data[0];

    // Check if slug is being changed and if it already exists
    if (slug && slug !== existingPage.slug) {
      const slugResult = await DatabaseUtil.executeQuery(
        'SELECT id FROM pages WHERE slug = ? AND id != ?',
        [slug, id]
      );

      if (slugResult.success && slugResult.data.length > 0) {
        const keyValueTable = { error: 'Slug already exists', slug };
        return res.status(400).json(ResponseFormatter.failure('Slug already exists', keyValueTable));
      }
    }

    // Prepare update fields
    const updateFields = [];
    const updateValues = [];

    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    if (slug !== undefined) {
      updateFields.push('slug = ?');
      updateValues.push(slug);
    }
    if (content !== undefined) {
      updateFields.push('content = ?');
      updateValues.push(content);
    }
    if (excerpt !== undefined) {
      updateFields.push('excerpt = ?');
      updateValues.push(excerpt);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
      
      // Set published_at if status is being changed to published
      if (status === 'published' && existingPage.status !== 'published') {
        updateFields.push('published_at = ?');
        updateValues.push(new Date());
      }
    }
    if (page_type !== undefined) {
      updateFields.push('page_type = ?');
      updateValues.push(page_type);
    }
    if (meta_title !== undefined) {
      updateFields.push('meta_title = ?');
      updateValues.push(meta_title);
    }
    if (meta_description !== undefined) {
      updateFields.push('meta_description = ?');
      updateValues.push(meta_description);
    }
    if (meta_keywords !== undefined) {
      updateFields.push('meta_keywords = ?');
      updateValues.push(meta_keywords);
    }
    if (featured_image !== undefined) {
      updateFields.push('featured_image = ?');
      updateValues.push(featured_image);
    }

    if (updateFields.length === 0) {
      const keyValueTable = { error: 'No fields to update' };
      return res.status(400).json(ResponseFormatter.failure('No fields to update', keyValueTable));
    }

    updateValues.push(id);

    const result = await DatabaseUtil.executeQuery(
      `UPDATE pages SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    if (result.success) {
      logger.info('Page updated', {
        pageId: id,
        updatedFields: updateFields,
        updatedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        pageId: id,
        updatedFields: updateFields.map(field => field.split(' = ')[0]),
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Page updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update page');
    }
  } catch (error) {
    logger.error('Update page error', {
      error: error.message,
      pageId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update page', keyValueTable));
  }
});

/**
 * DELETE /api/admin/content/pages/:id
 * Delete page
 */
router.delete('/pages/:id', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if page exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT title FROM pages WHERE id = ?',
      [id]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Page not found', pageId: id };
      return res.status(404).json(ResponseFormatter.failure('Page not found', keyValueTable));
    }

    const result = await DatabaseUtil.executeQuery(
      'DELETE FROM pages WHERE id = ?',
      [id]
    );

    if (result.success) {
      logger.info('Page deleted', {
        pageId: id,
        title: existingResult.data[0].title,
        deletedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        pageId: id,
        deletedBy: req.user.id,
        deletedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Page deleted successfully', keyValueTable));
    } else {
      throw new Error('Failed to delete page');
    }
  } catch (error) {
    logger.error('Delete page error', {
      error: error.message,
      pageId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to delete page', keyValueTable));
  }
});

module.exports = router;
/**
 
* GET /api/admin/content/menus
 * Get all menus
 */
router.get('/menus', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { location = '', active = '' } = req.query;

    let whereConditions = ['1=1'];
    let queryParams = [];

    if (location) {
      whereConditions.push('location = ?');
      queryParams.push(location);
    }

    if (active !== '') {
      whereConditions.push('is_active = ?');
      queryParams.push(active === 'true');
    }

    const whereClause = whereConditions.join(' AND ');

    const result = await DatabaseUtil.executeQuery(
      `SELECT * FROM menus WHERE ${whereClause} ORDER BY name ASC`,
      queryParams
    );

    if (result.success) {
      const keyValueTable = {
        menus: result.data,
        totalCount: result.data.length,
        filters: { location, active }
      };

      res.json(ResponseFormatter.success('Menus retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve menus');
    }
  } catch (error) {
    logger.error('Get menus error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get menus', keyValueTable));
  }
});

/**
 * GET /api/admin/content/menus/:id
 * Get specific menu with items
 */
router.get('/menus/:id', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get menu
    const menuResult = await DatabaseUtil.executeQuery(
      'SELECT * FROM menus WHERE id = ?',
      [id]
    );

    if (!menuResult.success || menuResult.data.length === 0) {
      const keyValueTable = { error: 'Menu not found', menuId: id };
      return res.status(404).json(ResponseFormatter.failure('Menu not found', keyValueTable));
    }

    // Get menu items
    const itemsResult = await DatabaseUtil.executeQuery(
      `SELECT * FROM menu_items 
       WHERE menu_id = ? 
       ORDER BY parent_id ASC, sort_order ASC`,
      [id]
    );

    const menu = menuResult.data[0];
    const items = itemsResult.success ? itemsResult.data : [];

    // Build hierarchical structure
    const buildMenuTree = (items, parentId = null) => {
      return items
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          ...item,
          children: buildMenuTree(items, item.id)
        }));
    };

    const keyValueTable = {
      ...menu,
      items: buildMenuTree(items)
    };

    res.json(ResponseFormatter.success('Menu retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Get menu error', {
      error: error.message,
      menuId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get menu', keyValueTable));
  }
});

/**
 * POST /api/admin/content/menus
 * Create new menu
 */
router.post('/menus', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { name, location, is_active = true } = req.body;

    if (!name || !location) {
      const keyValueTable = { error: 'name and location are required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required fields', keyValueTable));
    }

    const menuId = `MENU${Date.now()}${Math.random().toString(36).substr(2, 5)}`;

    const result = await DatabaseUtil.executeQuery(
      'INSERT INTO menus (id, name, location, is_active) VALUES (?, ?, ?, ?)',
      [menuId, name, location, is_active]
    );

    if (result.success) {
      logger.info('Menu created', {
        menuId,
        name,
        location,
        createdBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        menuId,
        name,
        location,
        is_active,
        createdBy: req.user.id,
        createdAt: new Date().toISOString()
      };

      res.status(201).json(ResponseFormatter.success('Menu created successfully', keyValueTable));
    } else {
      throw new Error('Failed to create menu');
    }
  } catch (error) {
    logger.error('Create menu error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to create menu', keyValueTable));
  }
});

/**
 * PUT /api/admin/content/menus/:id
 * Update menu
 */
router.put('/menus/:id', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, is_active } = req.body;

    // Check if menu exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM menus WHERE id = ?',
      [id]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Menu not found', menuId: id };
      return res.status(404).json(ResponseFormatter.failure('Menu not found', keyValueTable));
    }

    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (location !== undefined) {
      updateFields.push('location = ?');
      updateValues.push(location);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active);
    }

    if (updateFields.length === 0) {
      const keyValueTable = { error: 'No fields to update' };
      return res.status(400).json(ResponseFormatter.failure('No fields to update', keyValueTable));
    }

    updateValues.push(id);

    const result = await DatabaseUtil.executeQuery(
      `UPDATE menus SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    if (result.success) {
      logger.info('Menu updated', {
        menuId: id,
        updatedFields: updateFields,
        updatedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        menuId: id,
        updatedFields: updateFields.map(field => field.split(' = ')[0]),
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Menu updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update menu');
    }
  } catch (error) {
    logger.error('Update menu error', {
      error: error.message,
      menuId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update menu', keyValueTable));
  }
});

/**
 * POST /api/admin/content/menus/:id/items
 * Add menu item
 */
router.post('/menus/:id/items', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id: menuId } = req.params;
    const {
      parent_id = null,
      title,
      url,
      target = '_self',
      sort_order = 0,
      is_active = true
    } = req.body;

    if (!title) {
      const keyValueTable = { error: 'title is required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required field', keyValueTable));
    }

    // Check if menu exists
    const menuResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM menus WHERE id = ?',
      [menuId]
    );

    if (!menuResult.success || menuResult.data.length === 0) {
      const keyValueTable = { error: 'Menu not found', menuId };
      return res.status(404).json(ResponseFormatter.failure('Menu not found', keyValueTable));
    }

    const itemId = `ITEM${Date.now()}${Math.random().toString(36).substr(2, 5)}`;

    const result = await DatabaseUtil.executeQuery(
      `INSERT INTO menu_items (id, menu_id, parent_id, title, url, target, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, menuId, parent_id, title, url, target, sort_order, is_active]
    );

    if (result.success) {
      logger.info('Menu item created', {
        itemId,
        menuId,
        title,
        createdBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        itemId,
        menuId,
        title,
        url,
        sort_order,
        createdBy: req.user.id,
        createdAt: new Date().toISOString()
      };

      res.status(201).json(ResponseFormatter.success('Menu item created successfully', keyValueTable));
    } else {
      throw new Error('Failed to create menu item');
    }
  } catch (error) {
    logger.error('Create menu item error', {
      error: error.message,
      menuId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to create menu item', keyValueTable));
  }
});

/**
 * GET /api/admin/content/banners
 * Get all banners
 */
router.get('/banners', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      position = '', 
      active = '',
      search = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = ['1=1'];
    let queryParams = [];

    if (position) {
      whereConditions.push('position = ?');
      queryParams.push(position);
    }

    if (active !== '') {
      whereConditions.push('is_active = ?');
      queryParams.push(active === 'true');
    }

    if (search) {
      whereConditions.push('(title LIKE ? OR content LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await DatabaseUtil.executeQuery(
      `SELECT COUNT(*) as total FROM banners WHERE ${whereClause}`,
      queryParams
    );

    // Get banners
    const bannersResult = await DatabaseUtil.executeQuery(
      `SELECT 
        b.*,
        u.first_name,
        u.last_name
       FROM banners b
       LEFT JOIN users u ON b.created_by = u.id
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), offset]
    );

    if (bannersResult.success) {
      const total = countResult.success ? countResult.data[0].total : 0;
      const totalPages = Math.ceil(total / parseInt(limit));

      const keyValueTable = {
        banners: bannersResult.data.map(banner => ({
          ...banner,
          target_audience: banner.target_audience ? JSON.parse(banner.target_audience) : {},
          display_rules: banner.display_rules ? JSON.parse(banner.display_rules) : {}
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        filters: { position, active, search }
      };

      res.json(ResponseFormatter.success('Banners retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve banners');
    }
  } catch (error) {
    logger.error('Get banners error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get banners', keyValueTable));
  }
});

/**
 * POST /api/admin/content/banners
 * Create new banner
 */
router.post('/banners', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const {
      title,
      content = '',
      image_url = '',
      link_url = '',
      link_text = '',
      position = 'homepage',
      target_audience = {},
      display_rules = {},
      is_active = true
    } = req.body;

    if (!title) {
      const keyValueTable = { error: 'title is required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required field', keyValueTable));
    }

    const bannerId = `BANNER${Date.now()}${Math.random().toString(36).substr(2, 5)}`;

    const result = await DatabaseUtil.executeQuery(
      `INSERT INTO banners (
        id, title, content, image_url, link_url, link_text, position,
        target_audience, display_rules, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bannerId, title, content, image_url, link_url, link_text, position,
        JSON.stringify(target_audience), JSON.stringify(display_rules), is_active, req.user.id
      ]
    );

    if (result.success) {
      logger.info('Banner created', {
        bannerId,
        title,
        position,
        createdBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        bannerId,
        title,
        position,
        is_active,
        createdBy: req.user.id,
        createdAt: new Date().toISOString()
      };

      res.status(201).json(ResponseFormatter.success('Banner created successfully', keyValueTable));
    } else {
      throw new Error('Failed to create banner');
    }
  } catch (error) {
    logger.error('Create banner error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to create banner', keyValueTable));
  }
});

/**
 * GET /api/admin/content/media
 * Get media library files
 */
router.get('/media', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      type = '',
      search = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = ['1=1'];
    let queryParams = [];

    if (type) {
      whereConditions.push('mime_type LIKE ?');
      queryParams.push(`${type}/%`);
    }

    if (search) {
      whereConditions.push('(original_name LIKE ? OR alt_text LIKE ? OR caption LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await DatabaseUtil.executeQuery(
      `SELECT COUNT(*) as total FROM media_library WHERE ${whereClause}`,
      queryParams
    );

    // Get media files
    const mediaResult = await DatabaseUtil.executeQuery(
      `SELECT 
        m.*,
        u.first_name,
        u.last_name
       FROM media_library m
       LEFT JOIN users u ON m.uploaded_by = u.id
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), offset]
    );

    if (mediaResult.success) {
      const total = countResult.success ? countResult.data[0].total : 0;
      const totalPages = Math.ceil(total / parseInt(limit));

      const keyValueTable = {
        media: mediaResult.data,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        filters: { type, search }
      };

      res.json(ResponseFormatter.success('Media files retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve media files');
    }
  } catch (error) {
    logger.error('Get media error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get media files', keyValueTable));
  }
});/**
 
* GET /api/admin/content/seo/analysis
 * Get SEO analysis for pages and products
 */
router.get('/seo/analysis', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { type = 'all', page = 1, limit = 20 } = req.query;

    let queries = [];
    
    // Analyze pages
    if (type === 'all' || type === 'pages') {
      queries.push({
        type: 'pages',
        query: `
          SELECT 
            'page' as content_type,
            id,
            title,
            slug,
            meta_title,
            meta_description,
            meta_keywords,
            content,
            status,
            created_at
          FROM pages 
          WHERE status = 'published'
          ORDER BY created_at DESC
        `
      });
    }

    // Analyze products
    if (type === 'all' || type === 'products') {
      queries.push({
        type: 'products',
        query: `
          SELECT 
            'product' as content_type,
            id,
            name as title,
            slug,
            meta_title,
            meta_description,
            meta_keywords,
            description as content,
            status,
            created_at
          FROM products 
          WHERE status = 'approved'
          ORDER BY created_at DESC
        `
      });
    }

    const results = [];
    
    for (const queryObj of queries) {
      const result = await DatabaseUtil.executeQuery(queryObj.query);
      if (result.success) {
        results.push(...result.data);
      }
    }

    // Perform SEO analysis
    const seoAnalysis = results.map(item => {
      const analysis = {
        id: item.id,
        content_type: item.content_type,
        title: item.title,
        slug: item.slug,
        url: `/${item.content_type === 'product' ? 'products' : 'pages'}/${item.slug}`,
        issues: [],
        score: 100,
        recommendations: []
      };

      // Title analysis
      if (!item.title) {
        analysis.issues.push('Missing title');
        analysis.score -= 20;
      } else if (item.title.length < 30) {
        analysis.issues.push('Title too short (< 30 characters)');
        analysis.score -= 10;
        analysis.recommendations.push('Consider expanding the title to 30-60 characters');
      } else if (item.title.length > 60) {
        analysis.issues.push('Title too long (> 60 characters)');
        analysis.score -= 10;
        analysis.recommendations.push('Consider shortening the title to under 60 characters');
      }

      // Meta title analysis
      if (!item.meta_title) {
        analysis.issues.push('Missing meta title');
        analysis.score -= 15;
        analysis.recommendations.push('Add a meta title for better search engine visibility');
      } else if (item.meta_title.length > 60) {
        analysis.issues.push('Meta title too long (> 60 characters)');
        analysis.score -= 10;
      }

      // Meta description analysis
      if (!item.meta_description) {
        analysis.issues.push('Missing meta description');
        analysis.score -= 15;
        analysis.recommendations.push('Add a meta description to improve click-through rates');
      } else if (item.meta_description.length < 120) {
        analysis.issues.push('Meta description too short (< 120 characters)');
        analysis.score -= 5;
      } else if (item.meta_description.length > 160) {
        analysis.issues.push('Meta description too long (> 160 characters)');
        analysis.score -= 10;
      }

      // Content analysis
      if (!item.content) {
        analysis.issues.push('Missing content');
        analysis.score -= 25;
      } else {
        const contentLength = item.content.replace(/<[^>]*>/g, '').length;
        if (contentLength < 300) {
          analysis.issues.push('Content too short (< 300 words)');
          analysis.score -= 15;
          analysis.recommendations.push('Add more content to improve SEO value');
        }
      }

      // Keywords analysis
      if (!item.meta_keywords) {
        analysis.issues.push('Missing meta keywords');
        analysis.score -= 5;
        analysis.recommendations.push('Add relevant keywords to improve discoverability');
      }

      // Slug analysis
      if (!item.slug) {
        analysis.issues.push('Missing URL slug');
        analysis.score -= 10;
      } else if (item.slug.length > 50) {
        analysis.issues.push('URL slug too long');
        analysis.score -= 5;
      }

      // Ensure score doesn't go below 0
      analysis.score = Math.max(0, analysis.score);

      return analysis;
    });

    // Sort by score (lowest first to prioritize issues)
    seoAnalysis.sort((a, b) => a.score - b.score);

    const keyValueTable = {
      analysis: seoAnalysis,
      summary: {
        total_items: seoAnalysis.length,
        avg_score: seoAnalysis.reduce((sum, item) => sum + item.score, 0) / seoAnalysis.length,
        items_with_issues: seoAnalysis.filter(item => item.issues.length > 0).length,
        critical_issues: seoAnalysis.filter(item => item.score < 50).length
      }
    };

    res.json(ResponseFormatter.success('SEO analysis completed', keyValueTable));
  } catch (error) {
    logger.error('SEO analysis error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to perform SEO analysis', keyValueTable));
  }
});

/**
 * GET /api/admin/content/seo/suggestions
 * Get SEO suggestions and best practices
 */
router.get('/seo/suggestions', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const suggestions = {
      title_optimization: {
        title: 'Title Optimization',
        tips: [
          'Keep titles between 30-60 characters',
          'Include primary keywords near the beginning',
          'Make titles descriptive and compelling',
          'Avoid keyword stuffing',
          'Use unique titles for each page'
        ]
      },
      meta_description: {
        title: 'Meta Description Best Practices',
        tips: [
          'Keep descriptions between 120-160 characters',
          'Include a clear call-to-action',
          'Summarize the page content accurately',
          'Include target keywords naturally',
          'Make each description unique'
        ]
      },
      content_optimization: {
        title: 'Content Optimization',
        tips: [
          'Aim for at least 300 words of quality content',
          'Use header tags (H1, H2, H3) to structure content',
          'Include keywords naturally throughout the text',
          'Add internal and external links where relevant',
          'Use alt text for all images'
        ]
      },
      technical_seo: {
        title: 'Technical SEO',
        tips: [
          'Use clean, descriptive URLs',
          'Implement proper schema markup',
          'Ensure fast page loading times',
          'Make pages mobile-friendly',
          'Use HTTPS for security'
        ]
      },
      keyword_research: {
        title: 'Keyword Strategy',
        tips: [
          'Research relevant keywords for your industry',
          'Target long-tail keywords for better conversion',
          'Analyze competitor keywords',
          'Use keyword variations naturally',
          'Monitor keyword performance regularly'
        ]
      }
    };

    const keyValueTable = { suggestions };
    res.json(ResponseFormatter.success('SEO suggestions retrieved', keyValueTable));
  } catch (error) {
    logger.error('SEO suggestions error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get SEO suggestions', keyValueTable));
  }
});

/**
 * POST /api/admin/content/seo/bulk-update
 * Bulk update SEO settings for multiple items
 */
router.post('/seo/bulk-update', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      const keyValueTable = { error: 'updates array is required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required field', keyValueTable));
    }

    const queries = [];
    const updatedItems = [];

    for (const update of updates) {
      const { id, content_type, meta_title, meta_description, meta_keywords } = update;

      if (!id || !content_type) {
        const keyValueTable = { error: 'id and content_type are required for each update' };
        return res.status(400).json(ResponseFormatter.failure('Invalid update data', keyValueTable));
      }

      let tableName = content_type === 'product' ? 'products' : 'pages';
      
      const updateFields = [];
      const updateValues = [];

      if (meta_title !== undefined) {
        updateFields.push('meta_title = ?');
        updateValues.push(meta_title);
      }
      if (meta_description !== undefined) {
        updateFields.push('meta_description = ?');
        updateValues.push(meta_description);
      }
      if (meta_keywords !== undefined) {
        updateFields.push('meta_keywords = ?');
        updateValues.push(meta_keywords);
      }

      if (updateFields.length > 0) {
        updateValues.push(id);
        
        queries.push({
          sql: `UPDATE ${tableName} SET ${updateFields.join(', ')} WHERE id = ?`,
          bindParams: updateValues
        });

        updatedItems.push({
          id,
          content_type,
          updated_fields: updateFields.map(field => field.split(' = ')[0])
        });
      }
    }

    if (queries.length === 0) {
      const keyValueTable = { error: 'No valid updates provided' };
      return res.status(400).json(ResponseFormatter.failure('No updates to process', keyValueTable));
    }

    const result = await DatabaseUtil.executeTransaction(queries);

    if (result.success) {
      logger.info('Bulk SEO update', {
        itemsUpdated: updatedItems.length,
        updatedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        updated_items: updatedItems,
        total_updated: updatedItems.length,
        updated_by: req.user.id,
        updated_at: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('SEO settings updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update SEO settings');
    }
  } catch (error) {
    logger.error('Bulk SEO update error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update SEO settings', keyValueTable));
  }
});/**

 * PUT /api/admin/content/menus/:menuId/items/:itemId
 * Update menu item
 */
router.put('/menus/:menuId/items/:itemId', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { menuId, itemId } = req.params;
    const {
      parent_id,
      title,
      url,
      target,
      sort_order,
      is_active
    } = req.body;

    // Check if menu item exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM menu_items WHERE id = ? AND menu_id = ?',
      [itemId, menuId]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Menu item not found', itemId, menuId };
      return res.status(404).json(ResponseFormatter.failure('Menu item not found', keyValueTable));
    }

    const updateFields = [];
    const updateValues = [];

    if (parent_id !== undefined) {
      updateFields.push('parent_id = ?');
      updateValues.push(parent_id);
    }
    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    if (url !== undefined) {
      updateFields.push('url = ?');
      updateValues.push(url);
    }
    if (target !== undefined) {
      updateFields.push('target = ?');
      updateValues.push(target);
    }
    if (sort_order !== undefined) {
      updateFields.push('sort_order = ?');
      updateValues.push(sort_order);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active);
    }

    if (updateFields.length === 0) {
      const keyValueTable = { error: 'No fields to update' };
      return res.status(400).json(ResponseFormatter.failure('No fields to update', keyValueTable));
    }

    updateValues.push(itemId);

    const result = await DatabaseUtil.executeQuery(
      `UPDATE menu_items SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    if (result.success) {
      logger.info('Menu item updated', {
        itemId,
        menuId,
        updatedFields: updateFields,
        updatedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        itemId,
        menuId,
        updatedFields: updateFields.map(field => field.split(' = ')[0]),
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Menu item updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update menu item');
    }
  } catch (error) {
    logger.error('Update menu item error', {
      error: error.message,
      itemId: req.params.itemId,
      menuId: req.params.menuId,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update menu item', keyValueTable));
  }
});

/**
 * DELETE /api/admin/content/menus/:menuId/items/:itemId
 * Delete menu item
 */
router.delete('/menus/:menuId/items/:itemId', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { menuId, itemId } = req.params;

    // Check if menu item exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT title FROM menu_items WHERE id = ? AND menu_id = ?',
      [itemId, menuId]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Menu item not found', itemId, menuId };
      return res.status(404).json(ResponseFormatter.failure('Menu item not found', keyValueTable));
    }

    // Delete menu item (this will also delete children due to CASCADE)
    const result = await DatabaseUtil.executeQuery(
      'DELETE FROM menu_items WHERE id = ?',
      [itemId]
    );

    if (result.success) {
      logger.info('Menu item deleted', {
        itemId,
        menuId,
        title: existingResult.data[0].title,
        deletedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        itemId,
        menuId,
        deletedBy: req.user.id,
        deletedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Menu item deleted successfully', keyValueTable));
    } else {
      throw new Error('Failed to delete menu item');
    }
  } catch (error) {
    logger.error('Delete menu item error', {
      error: error.message,
      itemId: req.params.itemId,
      menuId: req.params.menuId,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to delete menu item', keyValueTable));
  }
});

/**
 * PUT /api/admin/content/banners/:id
 * Update banner
 */
router.put('/banners/:id', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      image_url,
      link_url,
      link_text,
      position,
      target_audience,
      display_rules,
      is_active
    } = req.body;

    // Check if banner exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM banners WHERE id = ?',
      [id]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Banner not found', bannerId: id };
      return res.status(404).json(ResponseFormatter.failure('Banner not found', keyValueTable));
    }

    const updateFields = [];
    const updateValues = [];

    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    if (content !== undefined) {
      updateFields.push('content = ?');
      updateValues.push(content);
    }
    if (image_url !== undefined) {
      updateFields.push('image_url = ?');
      updateValues.push(image_url);
    }
    if (link_url !== undefined) {
      updateFields.push('link_url = ?');
      updateValues.push(link_url);
    }
    if (link_text !== undefined) {
      updateFields.push('link_text = ?');
      updateValues.push(link_text);
    }
    if (position !== undefined) {
      updateFields.push('position = ?');
      updateValues.push(position);
    }
    if (target_audience !== undefined) {
      updateFields.push('target_audience = ?');
      updateValues.push(JSON.stringify(target_audience));
    }
    if (display_rules !== undefined) {
      updateFields.push('display_rules = ?');
      updateValues.push(JSON.stringify(display_rules));
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active);
    }

    if (updateFields.length === 0) {
      const keyValueTable = { error: 'No fields to update' };
      return res.status(400).json(ResponseFormatter.failure('No fields to update', keyValueTable));
    }

    updateValues.push(id);

    const result = await DatabaseUtil.executeQuery(
      `UPDATE banners SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    if (result.success) {
      logger.info('Banner updated', {
        bannerId: id,
        updatedFields: updateFields,
        updatedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        bannerId: id,
        updatedFields: updateFields.map(field => field.split(' = ')[0]),
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Banner updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update banner');
    }
  } catch (error) {
    logger.error('Update banner error', {
      error: error.message,
      bannerId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update banner', keyValueTable));
  }
});

/**
 * DELETE /api/admin/content/banners/:id
 * Delete banner
 */
router.delete('/banners/:id', protect, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if banner exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT title FROM banners WHERE id = ?',
      [id]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Banner not found', bannerId: id };
      return res.status(404).json(ResponseFormatter.failure('Banner not found', keyValueTable));
    }

    const result = await DatabaseUtil.executeQuery(
      'DELETE FROM banners WHERE id = ?',
      [id]
    );

    if (result.success) {
      logger.info('Banner deleted', {
        bannerId: id,
        title: existingResult.data[0].title,
        deletedBy: req.user.id,
        ip: req.ip
      });

      const keyValueTable = {
        bannerId: id,
        deletedBy: req.user.id,
        deletedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Banner deleted successfully', keyValueTable));
    } else {
      throw new Error('Failed to delete banner');
    }
  } catch (error) {
    logger.error('Delete banner error', {
      error: error.message,
      bannerId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to delete banner', keyValueTable));
  }
});