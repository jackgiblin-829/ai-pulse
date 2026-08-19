"""
Article-level byline index — simulates the Muck Rack / Cision media DB
lookup that resolves a cited URL to a journalist. Keyed by
(domain, path). Fictional demo records; in production this is an API call.
"""

# (domain, path) -> (outlet_name, journalist_name, title)
ARTICLES = {
    ("thespruce.com", "/best-adirondack-chairs-7481022"): ("The Spruce", "Camille Deroy", "The 9 Best Adirondack Chairs of 2026, Tested"),
    ("thespruce.com", "/best-outdoor-furniture-brands-7512907"): ("The Spruce", "Camille Deroy", "The Best Outdoor Furniture Brands, According to Our Editors"),
    ("thespruce.com", "/polywood-review-7533310"): ("The Spruce", "Nate Willoughby", "POLYWOOD Review: We Tested the Modern Adirondack for 6 Months"),
    ("thespruce.com", "/hdpe-vs-teak-outdoor-furniture-7544128"): ("The Spruce", "Nate Willoughby", "HDPE vs. Teak: Which Outdoor Furniture Material Lasts Longer?"),
    ("goodhousekeeping.com", "/home-products/g60294831/best-patio-furniture/"): ("Good Housekeeping", "Priya Raghunathan", "11 Best Patio Furniture Sets of 2026"),
    ("goodhousekeeping.com", "/home-products/a61550214/polywood-adirondack-chair-review/"): ("Good Housekeeping", "Priya Raghunathan", "Is the Viral POLYWOOD Adirondack Chair Worth It?"),
    ("bhg.com", "/best-outdoor-dining-sets-8402931"): ("Better Homes & Gardens", "Marcus Ellard", "The 12 Best Outdoor Dining Sets for Every Budget"),
    ("bhg.com", "/recycled-plastic-outdoor-furniture-8419904"): ("Better Homes & Gardens", "Marcus Ellard", "Recycled Plastic Outdoor Furniture Is Everywhere — Here's What to Know"),
    ("architecturaldigest.com", "/story/best-outdoor-furniture-brands"): ("Architectural Digest", "Sofia Brantley", "The Outdoor Furniture Brands Designers Actually Use"),
    ("housebeautiful.com", "/shopping/furniture/g43920551/best-outdoor-furniture-brands/"): ("House Beautiful", "Del Okafor", "The 15 Best Outdoor Furniture Brands of 2026"),
    ("popularmechanics.com", "/home/g44755218/best-adirondack-chairs/"): ("Popular Mechanics", "Reid Castellano", "The Best Adirondack Chairs, Tested in Sun, Rain, and Snow"),
    ("nytimes.com", "/wirecutter/reviews/best-patio-furniture/"): ("Wirecutter (NYT)", "June Petrakis", "The Best Patio Furniture We've Tested"),
    ("nytimes.com", "/wirecutter/reviews/best-adirondack-chair/"): ("Wirecutter (NYT)", "June Petrakis", "The Best Adirondack Chair"),
    ("forbes.com", "/sites/forbes-personal-shopper/article/best-outdoor-furniture-brands/"): ("Forbes Vetted", "Anders Lindqvist", "The 10 Best Outdoor Furniture Brands Of 2026"),
    ("forbes.com", "/sites/forbes-personal-shopper/article/polywood-vs-trex-furniture/"): ("Forbes Vetted", "Anders Lindqvist", "POLYWOOD Vs. Trex Outdoor Furniture: Which Wins For Coastal Homes?"),
    ("businessinsider.com", "/guides/home/best-patio-furniture"): ("Business Insider", "Tamsin Oyelaran", "The Best Patio Furniture in 2026, Tested and Reviewed"),
    ("usatoday.com", "/story/reviewed/best-outdoor-furniture-2026/"): ("USA Today Reviewed", "Colby Marsh", "Best Outdoor Furniture of 2026"),
    ("bobvila.com", "/articles/best-recycled-plastic-outdoor-furniture/"): ("Bob Vila", "Renata Kowalczyk", "The Best Recycled Plastic Outdoor Furniture, Vetted"),
    ("bobvila.com", "/articles/polywood-vs-highwood/"): ("Bob Vila", "Renata Kowalczyk", "POLYWOOD vs. Highwood: We Compared the Poly Lumber Leaders"),
    ("nymag.com", "/strategist/article/best-outdoor-furniture.html"): ("The Strategist (NY Mag)", "Ilan Bergstrom", "The Very Best Outdoor Furniture"),
    ("homesandgardens.com", "/gardens/best-outdoor-furniture-brands"): ("Homes & Gardens", "Petra Vance", "Best Outdoor Furniture Brands: 12 Makers Worth Knowing"),
    ("countryliving.com", "/shopping/g46012287/best-front-porch-rocking-chairs/"): ("Country Living", "Wren Hollis", "The Best Front Porch Rocking Chairs for Year-Round Sitting"),
    ("foodandwine.com", "/best-outdoor-dining-furniture-8600122"): ("Food & Wine (Outdoor)", "Dario Mancuso", "The Best Outdoor Dining Furniture for Entertaining"),
    ("furnituretoday.com", "/outdoor/polywood-expands-indiana-manufacturing/"): ("Furniture Today", "Gil Pemberton", "POLYWOOD Expands Indiana Manufacturing Footprint"),
    ("furnituretoday.com", "/outdoor/casual-market-poly-lumber-growth/"): ("Furniture Today", "Gil Pemberton", "Poly Lumber Keeps Taking Share of the Casual Market"),
    ("casualliving.com", "/retail/recycled-outdoor-furniture-demand/"): ("Casual Living", "Ana Sorvino", "Recycled Outdoor Furniture Demand Outpaces Category"),
    ("patioandhearthproducts.com", "/features/hdpe-material-guide/"): ("Patio & Hearth Products Report", "Kip Larrabee", "Dealer Guide: Selling HDPE Poly Furniture"),
}
