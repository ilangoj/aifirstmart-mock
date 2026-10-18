"""Reference lists for the synthetic data: tenants, places, people's names, the catalogue.

Everything here is invented for testing. Brand names match the ones the mock already shows. GST rates are
illustrative only; confirm them with an accountant before using the data for invoices.
"""

TENANTS = [
    {'key': 'demoretail', 'name': 'AIFirstMart Demo Retail', 'type': 'retailer', 'domain': 'demoretail.example',
     'pan': 'AAFCD4821K', 'state_code': '33', 'customers_share': 0.7,
     'channels': {'mobile_app': 'live', 'whatsapp': 'live', 'facebook': 'sandbox', 'ondc': 'sandbox', 'amazon': 'sandbox'},
     'locations': [
         ('ULP-01', 'Ulundurpet Main Store', 'store', 'Ulundurpet', 'Kallakurichi', '606107', 11.6913, 79.2875),
         ('KLK-01', 'Kallakurichi Store', 'store', 'Kallakurichi', 'Kallakurichi', '606202', 11.7383, 78.9614),
         ('VPM-01', 'Villupuram Store', 'store', 'Villupuram', 'Villupuram', '605602', 11.9401, 79.4861),
         ('TRY-01', 'Trichy Main Road Store', 'store', 'Ulundurpet', 'Kallakurichi', '606107', 11.6851, 79.2803),
         ('KLK-DC', 'Kallakurichi DC', 'warehouse', 'Kallakurichi', 'Kallakurichi', '606202', 11.7290, 78.9480),
         ('VPM-DC', 'Villupuram DC', 'warehouse', 'Villupuram', 'Villupuram', '605602', 11.9530, 79.4700)]},
    {'key': 'thendral', 'name': 'Thendral Fresh Mart', 'type': 'retailer', 'domain': 'thendralmart.example',
     'pan': 'AAGFT7310M', 'state_code': '33', 'customers_share': 0.3,
     'channels': {'mobile_app': 'sandbox', 'whatsapp': 'live', 'ondc': 'sandbox'},
     'locations': [
         ('MDU-01', 'Anna Nagar Store', 'store', 'Madurai', 'Madurai', '625020', 9.9312, 78.1404),
         ('MDU-02', 'KK Nagar Store', 'store', 'Madurai', 'Madurai', '625020', 9.9390, 78.1460),
         ('MDU-DS', 'Madurai Dark Store', 'dark_store', 'Madurai', 'Madurai', '625009', 9.9050, 78.1200)]},
    {'key': 'kaverifoods', 'name': 'Kaveri Foods', 'type': 'brand', 'domain': 'kaverifoods.example',
     'pan': 'AABCK5562P', 'state_code': '33', 'customers_share': 0.0,
     'channels': {'amazon': 'live', 'flipkart': 'sandbox', 'ondc': 'sandbox', 'facebook': 'sandbox'},
     'locations': [
         ('SLM-WH', 'Salem Warehouse', 'warehouse', 'Salem', 'Salem', '636005', 11.6643, 78.1460)]},
]

FIRST_NAMES = ['Arun', 'Bala', 'Chitra', 'Deepa', 'Ezhil', 'Gowri', 'Hari', 'Ilakkiya', 'Janani', 'Karthik', 'Kavitha',
               'Lakshmi', 'Mani', 'Meena', 'Murugan', 'Nandhini', 'Prabhu', 'Priya', 'Rajesh', 'Revathi', 'Saranya',
               'Senthil', 'Sundar', 'Tamilselvi', 'Uma', 'Vasanth', 'Vijay', 'Yamuna', 'Anbu', 'Dhanush', 'Gokul',
               'Indira', 'Jothi', 'Kumar', 'Malathi', 'Pandian', 'Radha', 'Selvi', 'Thilaga', 'Velu']
LAST_NAMES = ['Ramesh', 'Subramanian', 'Krishnan', 'Natarajan', 'Raman', 'Murugesan', 'Shanmugam', 'Venkatesan',
              'Palanisamy', 'Arumugam', 'Sundaram', 'Kannan', 'Rajendran', 'Selvaraj', 'Govindan', 'Ganesan']
STREETS = ['Gandhi Road', 'Bazaar Street', 'Kamarajar Salai', 'Periyar Nagar', 'Nehru Street', 'Temple Street',
           'Market Road', 'Anna Salai', 'Bharathi Street', 'Railway Feeder Road']
CARRIERS = ['Delhivery', 'DTDC', 'India Post', 'Shadowfax']

# Categories: id, name, Tamil name, illustrative GST %
CATEGORIES = [
    ('staples', 'Staples', 'மளிகை', 5), ('dairy', 'Dairy', 'பால் பொருட்கள்', 5), ('oils', 'Oils', 'எண்ணெய்', 5),
    ('produce', 'Fresh produce', 'காய்கறி மற்றும் பழங்கள்', 0), ('snacks', 'Snacks', 'தின்பண்டங்கள்', 5),
    ('beverages', 'Beverages', 'பானங்கள்', 5), ('spices', 'Spices', 'மசாலா', 5),
    ('personal', 'Personal care', 'தனிநபர் பராமரிப்பு', 5), ('household', 'Household', 'வீட்டு உபயோகம்', 18),
]

# Catalogue: name, Tamil name, brand, category, pack, unit, MRP in rupees, perishable, HSN
# The first eight are the mock's products, in the mock's order (SKUs 8901001 .. 8901008).
CATALOGUE = [
    ('Aashirvaad Atta 5kg', 'ஆசீர்வாத் கோதுமை மாவு 5 கிலோ', 'Aashirvaad', 'staples', '5kg', 'pack', 294, False, '1101'),
    ('Aavin Milk 500ml', 'ஆவின் பால் 500 மி.லி', 'Aavin', 'dairy', '500ml', 'pack', 26, True, '0401'),
    ('Ponni Rice 5kg', 'பொன்னி அரிசி 5 கிலோ', 'Local', 'staples', '5kg', 'pack', 348, False, '1006'),
    ('Tata Salt 1kg', 'டாடா உப்பு 1 கிலோ', 'Tata', 'staples', '1kg', 'pack', 28, False, '2501'),
    ('Sunflower Oil 1L', 'சூரியகாந்தி எண்ணெய் 1 லி', 'Gold Winner', 'oils', '1L', 'pack', 142, False, '1512'),
    ('Marie Gold 250g', 'மேரி கோல்ட் பிஸ்கட் 250 கி', 'Britannia', 'snacks', '250g', 'pack', 35, False, '1905'),
    ('Red Onion 1kg', 'சிவப்பு வெங்காயம் 1 கிலோ', 'Farm fresh', 'produce', '1kg', 'kg', 42, True, '0703'),
    ('Toor Dal 1kg', 'துவரம் பருப்பு 1 கிலோ', 'Local', 'staples', '1kg', 'pack', 168, False, '0713'),
    ('Idli Rice 5kg', 'இட்லி அரிசி 5 கிலோ', 'Local', 'staples', '5kg', 'pack', 290, False, '1006'),
    ('Urad Dal 1kg', 'உளுத்தம் பருப்பு 1 கிலோ', 'Local', 'staples', '1kg', 'pack', 156, False, '0713'),
    ('Sugar 1kg', 'சர்க்கரை 1 கிலோ', 'Local', 'staples', '1kg', 'pack', 48, False, '1701'),
    ('Moong Dal 500g', 'பாசிப் பருப்பு 500 கி', 'Local', 'staples', '500g', 'pack', 72, False, '0713'),
    ('Bengal Gram 1kg', 'கடலைப் பருப்பு 1 கிலோ', 'Local', 'staples', '1kg', 'pack', 98, False, '0713'),
    ('Rava 500g', 'ரவை 500 கி', 'Local', 'staples', '500g', 'pack', 32, False, '1103'),
    ('Aavin Curd 500g', 'ஆவின் தயிர் 500 கி', 'Aavin', 'dairy', '500g', 'pack', 30, True, '0403'),
    ('Aavin Ghee 200ml', 'ஆவின் நெய் 200 மி.லி', 'Aavin', 'dairy', '200ml', 'pack', 150, False, '0405'),
    ('Paneer 200g', 'பனீர் 200 கி', 'Milky Mist', 'dairy', '200g', 'pack', 95, True, '0406'),
    ('Butter 100g', 'வெண்ணெய் 100 கி', 'Amul', 'dairy', '100g', 'pack', 58, True, '0405'),
    ('Gingelly Oil 1L', 'நல்லெண்ணெய் 1 லி', 'Idhayam', 'oils', '1L', 'pack', 395, False, '1515'),
    ('Groundnut Oil 1L', 'கடலை எண்ணெய் 1 லி', 'Local', 'oils', '1L', 'pack', 210, False, '1508'),
    ('Coconut Oil 500ml', 'தேங்காய் எண்ணெய் 500 மி.லி', 'Parachute', 'oils', '500ml', 'pack', 120, False, '1513'),
    ('Tomato 1kg', 'தக்காளி 1 கிலோ', 'Farm fresh', 'produce', '1kg', 'kg', 36, True, '0702'),
    ('Small Onion 500g', 'சின்ன வெங்காயம் 500 கி', 'Farm fresh', 'produce', '500g', 'pack', 45, True, '0703'),
    ('Potato 1kg', 'உருளைக்கிழங்கு 1 கிலோ', 'Farm fresh', 'produce', '1kg', 'kg', 40, True, '0701'),
    ('Coconut', 'தேங்காய்', 'Farm fresh', 'produce', '1 nos', 'each', 32, True, '0801'),
    ('Nendran Banana 1kg', 'நேந்திரம் வாழைப்பழம் 1 கிலோ', 'Farm fresh', 'produce', '1kg', 'kg', 70, True, '0803'),
    ('Drumstick 250g', 'முருங்கைக்காய் 250 கி', 'Farm fresh', 'produce', '250g', 'pack', 30, True, '0709'),
    ('Curry Leaves', 'கறிவேப்பிலை', 'Farm fresh', 'produce', '1 bunch', 'each', 10, True, '0709'),
    ('Green Chilli 100g', 'பச்சை மிளகாய் 100 கி', 'Farm fresh', 'produce', '100g', 'pack', 12, True, '0709'),
    ('Good Day 200g', 'குட் டே பிஸ்கட் 200 கி', 'Britannia', 'snacks', '200g', 'pack', 40, False, '1905'),
    ('Murukku 200g', 'முறுக்கு 200 கி', 'Local', 'snacks', '200g', 'pack', 60, False, '2106'),
    ('Mixture 250g', 'மிக்சர் 250 கி', 'Local', 'snacks', '250g', 'pack', 70, False, '2106'),
    ('Rusk 300g', 'ரஸ்க் 300 கி', 'Local', 'snacks', '300g', 'pack', 55, False, '1905'),
    ('Tea Powder 250g', 'தேயிலைத் தூள் 250 கி', 'Tata Tea', 'beverages', '250g', 'pack', 140, False, '0902'),
    ('Filter Coffee 200g', 'ஃபில்டர் காபி தூள் 200 கி', 'Narasus', 'beverages', '200g', 'pack', 180, False, '0901'),
    ('Horlicks 500g', 'ஹார்லிக்ஸ் 500 கி', 'Horlicks', 'beverages', '500g', 'pack', 285, False, '1901'),
    ('Rasna 500g', 'ரஸ்னா 500 கி', 'Rasna', 'beverages', '500g', 'pack', 95, False, '2106'),
    ('Sambar Powder 200g', 'சாம்பார் பொடி 200 கி', 'Aachi', 'spices', '200g', 'pack', 68, False, '0910'),
    ('Chilli Powder 200g', 'மிளகாய்த் தூள் 200 கி', 'Aachi', 'spices', '200g', 'pack', 64, False, '0904'),
    ('Turmeric Powder 100g', 'மஞ்சள் தூள் 100 கி', 'Sakthi', 'spices', '100g', 'pack', 34, False, '0910'),
    ('Mustard 100g', 'கடுகு 100 கி', 'Local', 'spices', '100g', 'pack', 18, False, '1207'),
    ('Pepper 100g', 'மிளகு 100 கி', 'Local', 'spices', '100g', 'pack', 85, False, '0904'),
    ('Tamarind 500g', 'புளி 500 கி', 'Local', 'spices', '500g', 'pack', 90, False, '0810'),
    ('Toilet Soap 4x100g', 'குளியல் சோப் 4x100 கி', 'Medimix', 'personal', '4x100g', 'pack', 160, False, '3401'),
    ('Toothpaste 150g', 'பற்பசை 150 கி', 'Colgate', 'personal', '150g', 'pack', 110, False, '3306'),
    ('Shampoo 180ml', 'ஷாம்பு 180 மி.லி', 'Chik', 'personal', '180ml', 'pack', 125, False, '3305'),
    ('Coconut Hair Oil 200ml', 'தேங்காய் தலை எண்ணெய் 200 மி.லி', 'Parachute', 'personal', '200ml', 'pack', 98, False, '3305'),
    ('Detergent Powder 1kg', 'சலவைத் தூள் 1 கிலோ', 'Surf Excel', 'household', '1kg', 'pack', 140, False, '3402'),
    ('Dishwash Bar 3x200g', 'பாத்திரம் கழுவும் சோப் 3x200 கி', 'Vim', 'household', '3x200g', 'pack', 60, False, '3402'),
    ('Floor Cleaner 1L', 'தரை சுத்திகரிப்பான் 1 லி', 'Lizol', 'household', '1L', 'pack', 220, False, '3808'),
    ('Agarbatti 100g', 'ஊதுபத்தி 100 கி', 'Cycle', 'household', '100g', 'pack', 70, False, '3307'),
    ('Camphor 50g', 'கற்பூரம் 50 கி', 'Local', 'household', '50g', 'pack', 45, False, '2914'),
]

# The brand tenant (Kaveri Foods) sells its own packaged range.
BRAND_CATALOGUE = [
    ('Kaveri Ponni Rice 10kg', 'காவேரி பொன்னி அரிசி 10 கிலோ', 'staples', '10kg', 690, '1006'),
    ('Kaveri Ponni Rice 25kg', 'காவேரி பொன்னி அரிசி 25 கிலோ', 'staples', '25kg', 1650, '1006'),
    ('Kaveri Idli Rice 10kg', 'காவேரி இட்லி அரிசி 10 கிலோ', 'staples', '10kg', 580, '1006'),
    ('Kaveri Toor Dal 1kg', 'காவேரி துவரம் பருப்பு 1 கிலோ', 'staples', '1kg', 175, '0713'),
    ('Kaveri Sambar Powder 500g', 'காவேரி சாம்பார் பொடி 500 கி', 'spices', '500g', 150, '0910'),
    ('Kaveri Rasam Powder 200g', 'காவேரி ரசப் பொடி 200 கி', 'spices', '200g', 70, '0910'),
    ('Kaveri Gingelly Oil 5L', 'காவேரி நல்லெண்ணெய் 5 லி', 'oils', '5L', 1850, '1515'),
    ('Kaveri Groundnut Oil 5L', 'காவேரி கடலை எண்ணெய் 5 லி', 'oils', '5L', 1020, '1508'),
]

# Who works where: (role, how many per tenant, per store?)  Riders are staff with no platform role.
STAFF_PLAN_RETAILER = [
    ('tenant_owner', 1, False), ('tenant_admin', 1, False), ('store_manager', 1, True), ('cashier', 3, True),
    ('oms_supervisor', 1, False), ('warehouse_supervisor', 1, 'warehouse'), ('logistics_supervisor', 1, False),
    ('inventory_manager', 1, False), ('procurement', 1, False), ('catalog_manager', 1, False),
    ('pricing_manager', 1, False), ('finance', 1, False), ('payment_approver', 2, False),
    ('customer_support', 3, False), (None, 2, True)]
STAFF_PLAN_BRAND = [
    ('tenant_owner', 1, False), ('tenant_admin', 1, False), ('warehouse_supervisor', 1, 'warehouse'),
    ('inventory_manager', 1, False), ('catalog_manager', 1, False), ('pricing_manager', 1, False),
    ('finance', 1, False), ('payment_approver', 1, False), ('customer_support', 2, False)]

ROLE_LABELS = {
    'tenant_owner': 'Business owner', 'tenant_admin': 'Retail administrator', 'store_manager': 'Store manager',
    'cashier': 'Cashier', 'oms_supervisor': 'OMS supervisor', 'warehouse_supervisor': 'Warehouse supervisor',
    'logistics_supervisor': 'Logistics supervisor', 'inventory_manager': 'Inventory manager',
    'procurement': 'Procurement', 'catalog_manager': 'Catalogue manager', 'pricing_manager': 'Pricing and promotions',
    'finance': 'Finance and accounts', 'payment_approver': 'Payment approver', 'customer_support': 'Customer support',
    None: 'Rider'}

# Order mix per channel for retailers (share of immediate orders); brands sell only on marketplaces.
# Facebook and Instagram list the catalogue only; their orders come through WhatsApp or the web shop.
RETAIL_CHANNEL_MIX = {'pos': 0.52, 'mobile_app': 0.16, 'whatsapp': 0.14, 'web': 0.09, 'ondc': 0.05, 'amazon': 0.04}
BRAND_CHANNEL_MIX = {'amazon': 0.55, 'flipkart': 0.30, 'ondc': 0.15}
