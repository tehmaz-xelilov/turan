// === Turan Leather - Main JavaScript ===
// This file handles both the main site and admin panel functionality

// ==================== CONFIGURATION ====================
const API_BASE = '/api';
const CLOUDINARY_CLOUD_NAME = 'dmllkfvrc'; // BURANI ÖZ CLOUD NAME-İNİZLƏ DƏYİŞİN
const CLOUDINARY_UPLOAD_PRESET = 'turan_leather_unsigned';
const PRODUCTS_PER_PAGE = 9;
const ADMIN_PRODUCTS_PER_PAGE = 10;

// ==================== GLOBAL STATE ====================
let allProducts = [];
let allCategories = [];
let filteredProducts = [];
let displayedCount = 0;
let currentAdminPage = 1;
let currentProductId = null;
let deleteTarget = null; // { type: 'product' | 'category', id: string }
let swiperInstance = null;
let uploadedMainImage = null;
let uploadedAdditionalImages = [];

// ==================== UTILITY FUNCTIONS ====================

// Slugify string for filenames
function slugify(text) {
    const azerbaijaniMap = {
        'ə': 'e', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
        'ç': 'c', 'Ə': 'e', 'Ğ': 'g', 'I': 'i', 'Ö': 'o', 'Ş': 's',
        'Ü': 'u', 'Ç': 'c'
    };
    
    return text
        .toString()
        .toLowerCase()
        .replace(/[əğışöüçƏĞIÖŞÜÇ]/g, char => azerbaijaniMap[char] || char)
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

// Format price as AZN
function formatPrice(price) {
    return `₼ ${parseFloat(price).toFixed(2)}`;
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return; // Not on admin page
    
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    const toastContent = document.getElementById('toastContent');
    
    toast.className = `fixed bottom-6 right-6 z-50 transform transition-all duration-300 ${type}`;
    toast.classList.add('show');
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    
    toastIcon.className = `fa-solid ${icons[type] || icons.success}`;
    toastMessage.textContent = message;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Generate unique ID
function generateId() {
    return 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==================== API CALLS ====================

async function fetchProducts() {
    try {
        const response = await fetch(`${API_BASE}/products`);
        if (!response.ok) throw new Error('Məhsulları yükləmək mümkün olmadı');
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Error fetching products:', error);
        showToast('Məhsulları yükləyərkən xəta baş verdi', 'error');
        return [];
    }
}

async function fetchCategories() {
    try {
        const response = await fetch(`${API_BASE}/categories`);
        if (!response.ok) throw new Error('Kateqoriyaları yükləmək mümkün olmadı');
        const data = await response.json();
        return Array.isArray(data) ? data : ["Hamısı", "Çanta", "Ayaqqabı", "Kəmər", "Pul kisəsi", "Gödəkçə"];
    } catch (error) {
        console.error('Error fetching categories:', error);
        return ["Hamısı", "Çanta", "Ayaqqabı", "Kəmər", "Pul kisəsi", "Gödəkçə"];
    }
}

async function saveProduct(productData, isEdit = false) {
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit 
        ? `${API_BASE}/products?id=${productData.id}`
        : `${API_BASE}/products`;
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        
        const result = await response.json().catch(() => ({}));
        
        if (!response.ok) {
            throw new Error(result.error || result.details || result.message || 'Məhsul saxlanıla bilmədi');
        }
        return result;
    } catch (error) {
        console.error('Error saving product:', error);
        throw error;
    }
}

async function deleteProduct(productId) {
    try {
        const response = await fetch(`${API_BASE}/products?id=${productId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Məhsul silinə bilmədi');
        return await response.json();
    } catch (error) {
        console.error('Error deleting product:', error);
        throw error;
    }
}

async function saveCategory(categoryData) {
    const method = categoryData.oldName ? 'PUT' : 'POST';
    const url = `${API_BASE}/categories`;
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(categoryData)
        });
        if (!response.ok) throw new Error('Kateqoriya saxlanıla bilmədi');
        return await response.json();
    } catch (error) {
        console.error('Error saving category:', error);
        throw error;
    }
}

async function deleteCategory(categoryId) {
    try {
        const response = await fetch(`${API_BASE}/categories?id=${categoryId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Kateqoriya silinə bilmədi');
        return await response.json();
    } catch (error) {
        console.error('Error deleting category:', error);
        throw error;
    }
}

// ==================== CLOUDINARY UPLOAD ====================

async function uploadToCloudinary(file, onProgress = null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    // Generate filename with timestamp
    const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const extension = file.name.split('.').pop();
    const timestamp = Date.now();
    const slugifiedName = slugify(originalName);
    const publicId = `${slugifiedName}_${timestamp}`;
    formData.append('public_id', publicId);
    
    try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Upload failed');
        }
        
        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
}

async function deleteFromCloudinary(imageUrl) {
    try {
        // Extract public_id from Cloudinary URL
        const urlParts = imageUrl.split('/');
        const uploadIndex = urlParts.indexOf('upload');
        if (uploadIndex === -1) return;
        
        // Get everything after /upload/ and remove version if present
        let publicIdWithExt = urlParts.slice(uploadIndex + 1).join('/');
        // Remove version prefix if exists (v1234567890/)
        publicIdWithExt = publicIdWithExt.replace(/^v\d+\//, '');
        // Remove extension
        const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
        
        const response = await fetch(`${API_BASE}/cloudinary-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_id: publicId })
        });
        
        return await response.json();
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
    }
}

// ==================== MAIN SITE FUNCTIONS ====================

function isMainSite() {
    return document.getElementById('productsGrid') !== null;
}

function isAdminPanel() {
    return document.getElementById('productsTab') !== null;
}

async function loadMainSite() {
    if (!isMainSite()) return;
    
    showLoading();
    
    // Fetch data
    allProducts = await fetchProducts();
    allCategories = await fetchCategories();
    
    // Setup filters
    renderCategoryFilters();
    setupSearchListeners();
    setupMobileFilters();
    
    // Reset and show products
    resetFilters();
    applyFiltersAndRender();
    
    hideLoading();
}

function showLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.style.display = 'flex';
}

function hideLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.style.display = 'none';
}

function renderCategoryFilters() {
    const desktopContainer = document.getElementById('categoryFilters');
    const mobileContainer = document.getElementById('mobileCategoryFilters');
    
    if (!desktopContainer && !mobileContainer) return;
    
    // Ensure "Hamısı" is first
    const categories = allCategories.filter(c => c !== 'Hamısı');
    const displayCategories = ['Hamısı', ...categories];
    
    const renderButtons = (container) => {
        container.innerHTML = displayCategories.map(cat => `
            <button class="category-filter-btn ${cat === 'Hamısı' ? 'active' : ''}" 
                    data-category="${cat}">
                ${cat}
            </button>
        `).join('');
        
        // Add click listeners
        container.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.category-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyFiltersAndRender();
            });
        });
    };
    
    if (desktopContainer) renderButtons(desktopContainer);
    if (mobileContainer) renderButtons(mobileContainer);
}

function setupSearchListeners() {
    const searchInput = document.getElementById('searchInput');
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce(applyFiltersAndRender, 300));
    }
    
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', debounce(applyFiltersAndRender, 300));
    }
}

function setupMobileFilters() {
    const mobileFilterToggle = document.getElementById('mobileFilterToggle');
    const mobileFilterOverlay = document.getElementById('mobileFilterOverlay');
    const closeMobileFilter = document.getElementById('closeMobileFilter');
    const applyMobilePrice = document.getElementById('applyMobilePriceFilter');
    const resetMobileFilters = document.getElementById('resetMobileFilters');
    
    if (mobileFilterToggle) {
        mobileFilterToggle.addEventListener('click', () => {
            mobileFilterOverlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        });
    }
    
    if (closeMobileFilter) {
        closeMobileFilter.addEventListener('click', () => {
            mobileFilterOverlay.classList.add('hidden');
            document.body.style.overflow = '';
        });
    }
    
    if (applyMobilePrice) {
        applyMobilePrice.addEventListener('click', () => {
            applyFiltersAndRender();
            mobileFilterOverlay.classList.add('hidden');
            document.body.style.overflow = '';
        });
    }
    
    if (resetMobileFilters) {
        resetMobileFilters.addEventListener('click', () => {
            resetFilters();
            applyFiltersAndRender();
            mobileFilterOverlay.classList.add('hidden');
            document.body.style.overflow = '';
        });
    }
    
    // Desktop filters
    // Accept multiple possible IDs to match HTML variants
    const resetBtn = document.getElementById('resetFilters') || document.getElementById('resetFiltersBtn');
    const applyPriceBtn = document.getElementById('applyPriceFilter') || document.getElementById('applyPriceBtn') || document.getElementById('applyPrice');

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetFilters();
            applyFiltersAndRender();
        });
    }

    if (applyPriceBtn) {
        applyPriceBtn.addEventListener('click', applyFiltersAndRender);
    }
}

function resetFilters() {
    // Reset category
    const categoryBtns = document.querySelectorAll('.category-filter-btn');
    categoryBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === 'Hamısı') btn.classList.add('active');
    });
    
    // Reset price
    const minPrice = document.getElementById('minPrice');
    const maxPrice = document.getElementById('maxPrice');
    const mobileMinPrice = document.getElementById('mobileMinPrice');
    const mobileMaxPrice = document.getElementById('mobileMaxPrice');
    
    if (minPrice) minPrice.value = '';
    if (maxPrice) maxPrice.value = '';
    if (mobileMinPrice) mobileMinPrice.value = '';
    if (mobileMaxPrice) mobileMaxPrice.value = '';
    
    // Reset search
    const searchInput = document.getElementById('searchInput');
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    if (searchInput) searchInput.value = '';
    if (mobileSearchInput) mobileSearchInput.value = '';
}

function getActiveCategory() {
    const activeBtn = document.querySelector('.category-filter-btn.active');
    return activeBtn ? activeBtn.dataset.category : 'Hamısı';
}

function getPriceRange() {
    const minPriceEl = document.getElementById('minPrice') || document.getElementById('mobileMinPrice');
    const maxPriceEl = document.getElementById('maxPrice') || document.getElementById('mobileMaxPrice');
    
    const min = minPriceEl ? parseFloat(minPriceEl.value) || 0 : 0;
    const max = maxPriceEl ? parseFloat(maxPriceEl.value) || Infinity : Infinity;
    
    return { min, max };
}

function getSearchQuery() {
    const searchEl = document.getElementById('searchInput') || document.getElementById('mobileSearchInput');
    return searchEl ? searchEl.value.toLowerCase().trim() : '';
}

function applyFiltersAndRender() {
    if (!isMainSite()) return;
    
    const category = getActiveCategory();
    const { min, max } = getPriceRange();
    const query = getSearchQuery();
    
    filteredProducts = allProducts.filter(product => {
        // Category filter
        if (category !== 'Hamısı' && product.category !== category) return false;
        
        // Price filter
        const price = parseFloat(product.price);
        if (price < min || price > max) return false;
        
        // Search filter
        if (query && !product.name.toLowerCase().includes(query)) return false;
        
        return true;
    });
    
    // Update product count
    const countEl = document.getElementById('productCount') || document.getElementById('productCountText');
    const desktopCountEl = document.getElementById('desktopProductCount') || document.getElementById('productCountText');
    const countText = `${filteredProducts.length} məhsul tapıldı`;
    if (countEl) countEl.textContent = countText;
    if (desktopCountEl && desktopCountEl !== countEl) desktopCountEl.textContent = countText;
    
    // Reset displayed count
    displayedCount = 0;
    
    // Render products
    renderProducts();
}

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    
    if (!grid) return;
    
    // Load first batch or all displayed
    const productsToShow = filteredProducts.slice(0, displayedCount + PRODUCTS_PER_PAGE);
    displayedCount = productsToShow.length;
    
    // Render all products up to displayedCount
    grid.innerHTML = productsToShow.map(product => createProductCard(product)).join('');
    
    // Add event listeners
    grid.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                openProductModal(card.dataset.productId);
            }
        });
    });
    
    grid.querySelectorAll('.order-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const productId = btn.dataset.productId;
            const product = allProducts.find(p => p.id === productId);
            if (product) orderViaWhatsApp(product);
        });
    });
    
    grid.querySelectorAll('.detail-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openProductModal(btn.dataset.productId);
        });
    });
    
    // Show/hide load more button
    if (loadMoreContainer) {
        loadMoreContainer.style.display = displayedCount < filteredProducts.length ? 'flex' : 'none';
    }
}

function createProductCard(product) {
    const mainImage = product.mainImage || 'https://via.placeholder.com/400x400?text=No+Image';
    
    return `
        <div class="product-card cursor-pointer" data-product-id="${product.id}">
            <div class="relative h-64 overflow-hidden bg-[#F5F0E8]">
                <img src="${mainImage}" alt="${product.name}" 
                     class="w-full h-full object-cover" 
                     onerror="this.src='https://via.placeholder.com/400x400?text=No+Image'">
                <span class="absolute top-3 right-3 bg-[#1A1814] text-white text-xs px-2 py-1 rounded-full">
                    ${product.category || 'Ümumi'}
                </span>
            </div>
            <div class="p-4">
                <h3 class="font-semibold text-[#1A1814] text-lg truncate">${product.name}</h3>
                <p class="text-2xl font-bold text-[#C9A96E] mt-2">${formatPrice(product.price)}</p>
                <div class="flex items-center space-x-2 mt-4">
                    <button class="detail-btn flex-1 px-3 py-2 border border-[#D4C5B2] text-[#5C5548] rounded-lg text-sm hover:bg-gray-50 transition-colors" 
                            data-product-id="${product.id}">
                        <i class="fa-solid fa-eye mr-1"></i> Ətraflı
                    </button>
                    <button class="order-btn flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors" 
                            data-product-id="${product.id}">
                        <i class="fa-brands fa-whatsapp mr-1"></i> Sifariş et
                    </button>
                </div>
            </div>
        </div>
    `;
}

function openProductModal(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    const modal = document.getElementById('productModal');
    const swiperWrapper = document.getElementById('modalSwiperWrapper');
    
    // Set product details
    document.getElementById('modalProductName').textContent = product.name;
    document.getElementById('modalPrice').textContent = formatPrice(product.price);
    document.getElementById('modalCategory').textContent = product.category || '';
    document.getElementById('modalDescription').textContent = product.description || 'Məhsul haqqında ətraflı məlumat yoxdur.';
    
    // Build image array
    const images = [product.mainImage, ...(product.images || [])].filter(img => img);
    
    // Build swiper slides
    swiperWrapper.innerHTML = images.map(img => `
        <div class="swiper-slide flex items-center justify-center bg-[#F5F0E8]">
            <img src="${img}" alt="${product.name}" class="w-full h-full object-contain" 
                 onerror="this.src='https://via.placeholder.com/600x400?text=No+Image'">
        </div>
    `).join('');
    
    // Initialize or update Swiper
    if (swiperInstance) {
        swiperInstance.destroy();
    }
    
    swiperInstance = new Swiper('.productSwiper', {
        slidesPerView: 1,
        spaceBetween: 0,
        loop: images.length > 1,
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
        },
        navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
        },
    });
    
    // Setup order button
    document.getElementById('modalOrderBtn').onclick = () => orderViaWhatsApp(product);
    
    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function orderViaWhatsApp(product) {
    const adminPhone = '994XXXXXXXXX'; // Will be configured via env or fallback
    const siteUrl = window.location.origin;
    const message = `Salam, mən Turan Leather saytından aşağıdakı məhsulu sifariş etmək istəyirəm:\n\nMəhsul: ${product.name}\nQiymət: ${formatPrice(product.price)}\nKateqoriya: ${product.category || 'Ümumi'}\n\nLink: ${siteUrl}/#product-${product.id}`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${adminPhone}?text=${encodedMessage}`, '_blank');
}

// Load More button handler
document.addEventListener('click', (e) => {
    if (e.target.closest('#loadMoreBtn')) {
        renderProducts();
    }
});

// Close modal handlers
document.addEventListener('click', (e) => {
    if (e.target.id === 'productModal') {
        closeProductModal();
    }
    // support both old and new close button ids
    if (e.target.id === 'closeModal' || e.target.id === 'closeModalBtn' || e.target.closest('#closeModalBtn')) {
        closeProductModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProductModal();
});

// ==================== ADMIN PANEL FUNCTIONS ====================

async function loadAdminPanel() {
    if (!isAdminPanel()) return;
    
    allProducts = await fetchProducts();
    allCategories = await fetchCategories();
    
    setupAdminTabs();
    setupCategoryDropdowns();
    renderAdminProductsList();
    renderCategoriesList();
    setupAdminEventListeners();
}

function setupAdminTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // Update active states
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Show/hide content
            tabContents.forEach(content => {
                content.classList.add('hidden');
                if (content.id === `${targetTab}Tab`) {
                    content.classList.remove('hidden');
                }
            });
            
            // Refresh content if needed
            if (targetTab === 'products') renderAdminProductsList();
            if (targetTab === 'categories') renderCategoriesList();
        });
    });
}

function setupCategoryDropdowns() {
    const dropdowns = [
        document.getElementById('adminCategoryFilter'),
        document.getElementById('productCategory')
    ];
    
    dropdowns.forEach(dropdown => {
        if (!dropdown) return;
        
        const nonMainCategories = allCategories.filter(c => c !== 'Hamısı');
        dropdown.innerHTML = '<option value="">Seçin</option>' + 
            nonMainCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    });
}

function setupAdminEventListeners() {
    // Product form submission
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', handleProductSubmit);
    }
    
    // Cancel edit
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', resetProductForm);
    }
    
    // Add category form
    const addCategoryForm = document.getElementById('addCategoryForm');
    if (addCategoryForm) {
        addCategoryForm.addEventListener('submit', handleAddCategory);
    }
    
    // Admin search and filter
    const adminSearch = document.getElementById('adminSearch');
    const adminCategoryFilter = document.getElementById('adminCategoryFilter');
    
    if (adminSearch) {
        adminSearch.addEventListener('input', debounce(() => {
            currentAdminPage = 1;
            renderAdminProductsList();
        }, 300));
    }
    
    if (adminCategoryFilter) {
        adminCategoryFilter.addEventListener('change', () => {
            currentAdminPage = 1;
            renderAdminProductsList();
        });
    }
    
    // Delete modal handlers
    document.getElementById('cancelDelete')?.addEventListener('click', closeDeleteModal);
    document.getElementById('confirmDelete')?.addEventListener('click', handleDeleteConfirm);
    document.getElementById('deleteModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'deleteModal') closeDeleteModal();
    });
    
    // Refresh button
    document.getElementById('refreshDataBtn')?.addEventListener('click', async () => {
        allProducts = await fetchProducts();
        allCategories = await fetchCategories();
        setupCategoryDropdowns();
        renderAdminProductsList();
        renderCategoriesList();
        showToast('Məlumatlar yeniləndi', 'success');
    });
    
    // Image upload previews
    document.getElementById('mainImage')?.addEventListener('change', handleMainImageSelect);
    document.getElementById('additionalImages')?.addEventListener('change', handleAdditionalImagesSelect);
}

function renderAdminProductsList() {
    const container = document.getElementById('adminProductsList');
    if (!container) return;
    
    const searchQuery = document.getElementById('adminSearch')?.value?.toLowerCase() || '';
    const categoryFilter = document.getElementById('adminCategoryFilter')?.value || '';
    
    let filtered = allProducts;
    
    if (searchQuery) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery));
    }
    
    if (categoryFilter) {
        filtered = filtered.filter(p => p.category === categoryFilter);
    }
    
    // Pagination
    const totalPages = Math.ceil(filtered.length / ADMIN_PRODUCTS_PER_PAGE);
    const start = (currentAdminPage - 1) * ADMIN_PRODUCTS_PER_PAGE;
    const paginatedProducts = filtered.slice(start, start + ADMIN_PRODUCTS_PER_PAGE);
    
    if (paginatedProducts.length === 0) {
        container.innerHTML = `
            <div class="no-products">
                <i class="fa-solid fa-box-open"></i>
                <p>Heç bir məhsul tapılmadı</p>
            </div>
        `;
    } else {
        container.innerHTML = paginatedProducts.map(product => `
            <div class="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <img src="${product.mainImage}" alt="${product.name}" 
                     class="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                     onerror="this.src='https://via.placeholder.com/64?text=N/A'">
                <div class="flex-1 min-w-0">
                    <h3 class="font-medium truncate">${product.name}</h3>
                    <p class="text-sm text-gray-500">${product.category || 'Kateqoriyasız'} · ${formatPrice(product.price)}</p>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="edit-product-btn px-3 py-1.5 text-sm border border-[#D4C5B2] rounded-lg hover:bg-gray-50" 
                            data-product-id="${product.id}">
                        <i class="fa-solid fa-pen mr-1"></i> Redaktə
                    </button>
                    <button class="delete-product-btn px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700" 
                            data-product-id="${product.id}">
                        <i class="fa-solid fa-trash mr-1"></i> Sil
                    </button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners
        container.querySelectorAll('.edit-product-btn').forEach(btn => {
            btn.addEventListener('click', () => editProduct(btn.dataset.productId));
        });
        
        container.querySelectorAll('.delete-product-btn').forEach(btn => {
            btn.addEventListener('click', () => openDeleteModal('product', btn.dataset.productId));
        });
    }
    
    // Render pagination
    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    if (!container) return;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    html += `<button class="pagination-btn" ${currentAdminPage === 1 ? 'disabled' : ''} data-page="${currentAdminPage - 1}">
        <i class="fa-solid fa-chevron-left"></i>
    </button>`;
    
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="pagination-btn ${i === currentAdminPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    
    html += `<button class="pagination-btn" ${currentAdminPage === totalPages ? 'disabled' : ''} data-page="${currentAdminPage + 1}">
        <i class="fa-solid fa-chevron-right"></i>
    </button>`;
    
    container.innerHTML = html;
    
    container.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (page && page !== currentAdminPage) {
                currentAdminPage = page;
                renderAdminProductsList();
                container.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function renderCategoriesList() {
    const container = document.getElementById('categoriesList');
    if (!container) return;
    
    const categories = allCategories.filter(c => c !== 'Hamısı');
    
    if (categories.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Heç bir kateqoriya yoxdur</p>';
        return;
    }
    
    container.innerHTML = categories.map((cat, index) => `
        <div class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
            <span class="font-medium">${cat}</span>
            <div class="flex items-center space-x-2">
                <button class="edit-category-btn text-[#C9A96E] hover:text-[#A8894A] transition-colors" 
                        data-category="${cat}" data-index="${index}">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="delete-category-btn text-red-500 hover:text-red-700 transition-colors" 
                        data-category="${cat}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    // Add event listeners
    container.querySelectorAll('.edit-category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const newName = prompt('Yeni kateqoriya adını daxil edin:', btn.dataset.category);
            if (newName && newName.trim() && newName !== btn.dataset.category) {
                handleEditCategory(btn.dataset.category, newName.trim());
            }
        });
    });
    
    container.querySelectorAll('.delete-category-btn').forEach(btn => {
        btn.addEventListener('click', () => openDeleteModal('category', btn.dataset.category));
    });
}

async function handleAddCategory(e) {
    e.preventDefault();
    const input = document.getElementById('newCategoryName');
    const name = input.value.trim();
    
    if (!name) return;
    
    if (allCategories.includes(name)) {
        showToast('Bu kateqoriya artıq mövcuddur', 'error');
        return;
    }
    
    try {
        await saveCategory({ name: name });
        allCategories = await fetchCategories();
        setupCategoryDropdowns();
        renderCategoriesList();
        input.value = '';
        showToast('Kateqoriya əlavə edildi', 'success');
    } catch (error) {
        showToast('Xəta baş verdi: ' + error.message, 'error');
    }
}

async function handleEditCategory(oldName, newName) {
    if (allCategories.includes(newName)) {
        showToast('Bu kateqoriya artıq mövcuddur', 'error');
        return;
    }
    
    try {
        await saveCategory({ oldName: oldName, name: newName });
        allCategories = await fetchCategories();
        setupCategoryDropdowns();
        renderAdminProductsList();
        renderCategoriesList();
        showToast('Kateqoriya yeniləndi', 'success');
    } catch (error) {
        showToast('Xəta baş verdi: ' + error.message, 'error');
    }
}

function openDeleteModal(type, id) {
    deleteTarget = { type, id };
    const modal = document.getElementById('deleteModal');
    const message = document.getElementById('deleteMessage');
    
    if (type === 'product') {
        message.textContent = 'Bu məhsulu silmək istədiyinizə əminsiniz? Məhsulun bütün şəkilləri də silinəcək.';
    } else {
        message.textContent = 'Bu kateqoriyanı silmək istədiyinizə əminsiniz? Bu kateqoriyaya aid məhsullar "Kateqoriyasız" olaraq qalacaq.';
    }
    
    modal.classList.add('active');
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    modal.classList.remove('active');
    deleteTarget = null;
}

async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    
    try {
        if (deleteTarget.type === 'product') {
            // Delete from Cloudinary first
            const product = allProducts.find(p => p.id === deleteTarget.id);
            if (product) {
                if (product.mainImage) await deleteFromCloudinary(product.mainImage);
                if (product.images && product.images.length > 0) {
                    for (const img of product.images) {
                        await deleteFromCloudinary(img);
                    }
                }
            }
            
            await deleteProduct(deleteTarget.id);
            showToast('Məhsul silindi', 'success');
        } else if (deleteTarget.type === 'category') {
            await deleteCategory(deleteTarget.id);
            allCategories = await fetchCategories();
            setupCategoryDropdowns();
            renderCategoriesList();
            showToast('Kateqoriya silindi', 'success');
        }
        
        // Refresh data
        allProducts = await fetchProducts();
        renderAdminProductsList();
    } catch (error) {
        showToast('Silinmə zamanı xəta: ' + error.message, 'error');
    }
    
    closeDeleteModal();
}

function editProduct(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    // Switch to add product tab
    const addTabBtn = document.querySelector('[data-tab="addProduct"]');
    if (addTabBtn) addTabBtn.click();
    
    // Fill form
    document.getElementById('formTitle').textContent = 'Məhsulu Redaktə Et';
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productCategory').value = product.category || '';
    document.getElementById('productDescription').value = product.description || '';
    
    // Show existing images
    const mainPreview = document.getElementById('mainImagePreview');
    if (mainPreview) {
        mainPreview.innerHTML = product.mainImage ? `
            <div class="image-preview-container">
                <img src="${product.mainImage}" class="image-preview-thumb">
                <span class="text-xs text-gray-500 mt-1 block">Əsas şəkil</span>
            </div>
        ` : '';
    }
    
    const additionalPreview = document.getElementById('additionalImagesPreview');
    if (additionalPreview && product.images) {
        additionalPreview.innerHTML = product.images.map((img, i) => `
            <div class="image-preview-container">
                <img src="${img}" class="image-preview-thumb">
                <button type="button" class="remove-image-btn" data-image-index="${i}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `).join('');
        
        // Add remove listeners
        additionalPreview.querySelectorAll('.remove-image-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.remove();
            });
        });
    }
    
    // Update uploaded images arrays with existing
    uploadedMainImage = product.mainImage || null;
    uploadedAdditionalImages = product.images ? [...product.images] : [];
    
    // Show cancel button
    document.getElementById('cancelEditBtn').classList.remove('hidden');
    document.getElementById('submitBtn').innerHTML = '<i class="fa-solid fa-save mr-1"></i> Yenilə';
    
    // Scroll to form
    document.getElementById('addProductTab').scrollIntoView({ behavior: 'smooth' });
}

function resetProductForm() {
    document.getElementById('formTitle').textContent = 'Yeni Məhsul Əlavə Et';
    document.getElementById('productId').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productCategory').value = '';
    document.getElementById('productDescription').value = '';
    document.getElementById('mainImagePreview').innerHTML = '';
    document.getElementById('additionalImagesPreview').innerHTML = '';
    document.getElementById('mainImage').value = '';
    document.getElementById('additionalImages').value = '';
    document.getElementById('cancelEditBtn').classList.add('hidden');
    document.getElementById('submitBtn').innerHTML = '<i class="fa-solid fa-save mr-1"></i> Yadda saxla';
    
    uploadedMainImage = null;
    uploadedAdditionalImages = [];
}

async function handleProductSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saxlanılır...';
    
    try {
        const productId = document.getElementById('productId').value;
        const name = document.getElementById('productName').value.trim();
        const price = parseFloat(document.getElementById('productPrice').value);
        const category = document.getElementById('productCategory').value;
        const description = document.getElementById('productDescription').value.trim();
        
        // Upload main image if new file selected
        const mainImageInput = document.getElementById('mainImage');
        if (mainImageInput.files.length > 0) {
            showUploadProgress('Əsas şəkil yüklənir...');
            uploadedMainImage = await uploadToCloudinary(mainImageInput.files[0]);
        }
        
        // Upload additional images if new files selected
        const additionalInput = document.getElementById('additionalImages');
        if (additionalInput.files.length > 0) {
            showUploadProgress('Əlavə şəkillər yüklənir...');
            for (const file of additionalInput.files) {
                const url = await uploadToCloudinary(file);
                uploadedAdditionalImages.push(url);
            }
        }
        
        // Remove any deleted additional images (those removed from preview)
        const previewImages = document.querySelectorAll('#additionalImagesPreview img');
        const previewUrls = Array.from(previewImages).map(img => img.src);
        uploadedAdditionalImages = uploadedAdditionalImages.filter(url => previewUrls.includes(url));
        
        if (!uploadedMainImage && !productId) {
            throw new Error('Əsas şəkil tələb olunur');
        }
        
        const productData = {
            name,
            price,
            category: category || null,
            description,
            mainImage: uploadedMainImage,
            images: uploadedAdditionalImages
        };
        
        const isEdit = !!productId;
        if (productId) {
            productData.id = productId;
        } else {
            productData.id = generateId();
        }
        
        await saveProduct(productData, isEdit);
        
        // Refresh data
        allProducts = await fetchProducts();
        renderAdminProductsList();
        
        // Reset form
        resetProductForm();
        
        // Switch to products tab
        document.querySelector('[data-tab="products"]').click();
        
        showToast(productId ? 'Məhsul yeniləndi' : 'Məhsul əlavə edildi', 'success');
    } catch (error) {
        showToast('Xəta baş verdi: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-save mr-1"></i> Yadda saxla';
        hideUploadProgress();
    }
}

function showUploadProgress(message) {
    const progress = document.getElementById('uploadProgress');
    const status = document.getElementById('uploadStatus');
    if (progress) {
        progress.classList.remove('hidden');
        if (status) status.textContent = message;
    }
}

function hideUploadProgress() {
    const progress = document.getElementById('uploadProgress');
    if (progress) {
        progress.classList.add('hidden');
    }
}

function handleMainImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('mainImagePreview');
        if (preview) {
            preview.innerHTML = `
                <div class="image-preview-container">
                    <img src="${e.target.result}" class="image-preview-thumb">
                    <span class="text-xs text-green-600 mt-1 block">Yeni şəkil seçildi</span>
                </div>
            `;
        }
    };
    reader.readAsDataURL(file);
}

function handleAdditionalImagesSelect(e) {
    const files = Array.from(e.target.files);
    const preview = document.getElementById('additionalImagesPreview');
    if (!preview) return;
    
    // Keep existing previews
    let existingHtml = preview.innerHTML;
    
    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            existingHtml += `
                <div class="image-preview-container">
                    <img src="${e.target.result}" class="image-preview-thumb">
                    <button type="button" class="remove-image-btn" data-new-index="${index}">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
            preview.innerHTML = existingHtml;
            
            // Add remove listeners for new images
            preview.querySelectorAll(`[data-new-index="${index}"]`).forEach(btn => {
                btn.addEventListener('click', () => {
                    btn.parentElement.remove();
                });
            });
        };
        reader.readAsDataURL(file);
    });
}

// ==================== UTILITY: Debounce ====================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    if (isMainSite()) {
        loadMainSite();
    }
    
    if (isAdminPanel()) {
        loadAdminPanel();
    }
    
    // Hero explore button: scroll to products
    const exploreBtn = document.getElementById('exploreBtn');
    if (exploreBtn) {
        exploreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const grid = document.getElementById('productsGrid');
            if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // ensure filters applied
            applyFiltersAndRender();
        });
    }
});


// === script.js əlavə düzəlişlər (yalnız createProductCard funksiyasını yeniləyin) ===

function createProductCard(product) {
    const mainImage = product.mainImage || 'https://via.placeholder.com/400x400?text=No+Image';
    const category = product.category || 'Koleksiya';
    return `
        <div class="product-card" data-product-id="${product.id}">
            <img class="product-image" src="${mainImage}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/400x400?text=Turan'">
            <div class="product-info">
                <div class="product-category">${category}</div>
                <h3 class="product-name">${escapeHtml(product.name)}</h3>
                <div class="product-price">₼ ${parseFloat(product.price).toFixed(2)}</div>
                <div class="card-actions">
                    <button class="btn-detail detail-btn" data-product-id="${product.id}"><i class="fas fa-eye"></i> Bax</button>
                    <button class="btn-order order-btn" data-product-id="${product.id}"><i class="fab fa-whatsapp"></i> Sifariş</button>
                </div>
            </div>
        </div>
    `;
}
// Həmçinin showToast funksiyasını dəyişin (style.css ilə uyğun):
window.showToast = function(message, type = 'success') {
    const toast = document.getElementById('toastMsg');
    const textSpan = document.getElementById('toastText');
    if(!toast) return;
    textSpan.innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
};
// escapeHtml funksiyası əlavə edin:
function escapeHtml(str) {
    if(!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if(m === '&') return '&amp;';
        if(m === '<') return '&lt;';
        if(m === '>') return '&gt;';
        return m;
    });
}