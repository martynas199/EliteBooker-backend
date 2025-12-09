import dotenv from "dotenv";
import mongoose from "mongoose";
import BlogPost from "../src/models/BlogPost.js";
import Admin from "../src/models/Admin.js";

// Load environment variables
dotenv.config();

const services = [
  {
    name: "Permanent Make-Up Brows ",
    category: "Permanent makeup",
  },
  {
    name: "Lips permanent make up",
    category: "Permanent makeup",
  },
  {
    name: "Brow lamination ",
    category: "Brows",
  },
  {
    name: "Laser tattoo removal ",
    category: "Laser treatment ",
  },
  {
    name: "Laser teeth whitening ",
    category: "Teeth ",
  },
  {
    name: "Combined facial cleansing",
    category: "Face treatment ",
  },
  {
    name: "Acid Peels",
    category: "Face treatment",
  },
  {
    name: "Ultrasonic Facial Cleansing",
    category: "Face treatment ",
  },
  {
    name: "Express treatment",
    category: "Face treatment",
  },
  {
    name: "Acne and Inflammatory Pimples Treatment",
    category: "Face treatment",
  },
  {
    name: "Pigmentation Lightening",
    category: "Face treatment",
  },
  {
    name: "Rosacea treatment ",
    category: "Face treatment ",
  },
  {
    name: "Deep Skin Hydration",
    category: "Face treatment ",
  },
  {
    name: "Rejuvenating treatment ",
    category: "Face treatment ",
  },
  {
    name: "Nourishing treatment",
    category: "Face treatment ",
  },
  {
    name: "LED therapy treatment ",
    category: "Face treatment ",
  },
  {
    name: "Luxury treatment",
    category: "Face treatment ",
  },
  {
    name: "Microneedle Mesotherapy",
    category: "Face treatment ",
  },
  {
    name: "Lip Fillers Russian or Classic",
    category: "Injections ",
  },
  {
    name: "Hyaluronidase",
    category: "Injections ",
  },
  {
    name: "Cheeks Augmentation",
    category: "Injections ",
  },
  {
    name: "Chin Augmentation",
    category: "Injections ",
  },
  {
    name: "Nasolabial Folds ",
    category: "Injections ",
  },
  {
    name: "Neck Wrinkle Reducion",
    category: "Injections ",
  },
  {
    name: "Marionette Lines",
    category: "Injections ",
  },
  {
    name: "Hair extensions ",
    category: "Hair Extensions ",
  },
  {
    name: "Hair extension removal ",
    category: "Hair Extensions ",
  },
  {
    name: "Hair extension re-bonding",
    category: "Hair extensions ",
  },
  {
    name: "Anti -  wrinkle injections ",
    category: "Injections ",
  },
  {
    name: "Ejal Skin Booster",
    category: "Skin booster",
  },
  {
    name: '"Jalupro Super Hydro" skin booster',
    category: "Skin booster",
  },
  {
    name: "Amber salicylic Hyaluronic acid skin booster",
    category: "Skin booster",
  },
  {
    name: "Neck skin booster",
    category: "Skin booster",
  },
  {
    name: "Lumi Eyes Skin booster",
    category: "Skin booster",
  },
  {
    name: "Lipolytic Fat Dissolve ",
    category: "Injections ",
  },
  {
    name: "Hair wash & style",
    category: "Hair",
  },
  {
    name: "Cut & blowdry",
    category: "Hair",
  },
  {
    name: "Hair mask procedure ",
    category: "Hair ",
  },
  {
    name: "Hair botox procedure",
    category: "Hair",
  },
  {
    name: "Saphira mineral sea salt hair straightening, long lasting treatment",
    category: "Hair",
  },
  {
    name: "Hair colouring (roots only)",
    category: "Hair",
  },
  {
    name: "Hair colour - all over",
    category: "Hair",
  },
  {
    name: "Full head highlights / lowlights",
    category: "Hair",
  },
  {
    name: "Half head highlights / lowlights",
    category: "Hair",
  },
  {
    name: "Complex hair dyeing techniques",
    category: "Hair ",
  },
  {
    name: "Hair toner",
    category: "Hair",
  },
  {
    name: "Bioplex hydrating & repairing hair treatment",
    category: "Hair",
  },
  {
    name: "Front hair section of highlights / lowlights",
    category: "Hair",
  },
  {
    name: "SkinTags, Milium Removal ",
    category: "Specialist",
  },
  {
    name: "Dr. Cyj Hair Filler",
    category: "Injections ",
  },
  {
    name: "Lumi -Pro skin booster",
    category: "Skin booster",
  },
  {
    name: "Face relaxig massage",
    category: "Face ",
  },
  {
    name: "Gold package ",
    category: "Body",
  },
  {
    name: "Silver package ",
    category: "Body",
  },
  {
    name: "Lip wax",
    category: "Waxing ",
  },
  {
    name: "Chin waxing ",
    category: "Waxing",
  },
  {
    name: "Underarm waxing",
    category: "Waxing ",
  },
  {
    name: "Full arm waxing ",
    category: "Waxing",
  },
  {
    name: "Half arm waxing",
    category: "Waxing ",
  },
  {
    name: "Full leg waxing",
    category: "Waxing",
  },
  {
    name: "Half leg waxing ",
    category: "Waxing",
  },
  {
    name: "Brow Lamination",
    category: "Brows",
  },
  {
    name: "Eyelash lamination",
    category: "Eyelashes ",
  },
  {
    name: "Brow botox",
    category: "Brows",
  },
  {
    name: "Eyelash botox",
    category: "Eyelashes",
  },
  {
    name: "Henna Brows",
    category: "Brows",
  },
  {
    name: "Eyebrow tinting",
    category: "Brows",
  },
  {
    name: "Eyelash tint",
    category: "Eyelashes",
  },
  {
    name: "Same day correction ",
    category: "Hair extensions ",
  },
];

// Blog post templates for different service types
const blogTemplates = {
  "Permanent makeup": {
    title: (name) => `The Ultimate Guide to ${name} at Noble Elegance`,
    excerpt: (name) =>
      `Discover everything you need to know about ${name.toLowerCase()} - from the procedure to aftercare, and why it's one of our most popular treatments in Wisbech.`,
    content: (name) => `
<h2>What is ${name}?</h2>
<p>${name} is a semi-permanent cosmetic procedure that enhances your natural features, giving you beautiful, long-lasting results. At Noble Elegance in Wisbech, our expert technicians use the latest techniques and highest quality pigments to create stunning, natural-looking permanent makeup.</p>

<h2>Benefits of ${name}</h2>
<ul>
  <li><strong>Time-Saving:</strong> Wake up with perfect makeup every day - no more morning rush!</li>
  <li><strong>Long-Lasting Results:</strong> Enjoy beautiful results that last 1-3 years</li>
  <li><strong>Natural Appearance:</strong> Our skilled technicians create subtle, natural-looking enhancements</li>
  <li><strong>Waterproof & Smudge-Proof:</strong> Perfect for active lifestyles, swimming, and gym sessions</li>
  <li><strong>Confidence Boost:</strong> Feel beautiful and confident without daily makeup application</li>
</ul>

<h2>The Procedure</h2>
<p>Our permanent makeup procedure typically takes 2-3 hours and includes:</p>
<ol>
  <li><strong>Consultation:</strong> We discuss your desired look, skin type, and colour preferences</li>
  <li><strong>Design & Mapping:</strong> Creating the perfect shape that complements your facial features</li>
  <li><strong>Numbing:</strong> Topical anaesthetic is applied for your comfort</li>
  <li><strong>Application:</strong> Using precision tools, we carefully apply the pigment</li>
  <li><strong>Aftercare Instructions:</strong> Detailed guidance to ensure optimal healing</li>
</ol>

<h2>Aftercare Tips</h2>
<p>Proper aftercare is essential for beautiful, long-lasting results:</p>
<ul>
  <li>Keep the area clean and dry for the first week</li>
  <li>Avoid touching or picking at the treated area</li>
  <li>Apply the recommended healing ointment</li>
  <li>Avoid sun exposure, swimming, and saunas for 2 weeks</li>
  <li>Attend your touch-up appointment after 6-8 weeks</li>
</ul>

<h2>Why Choose Noble Elegance?</h2>
<p>At Noble Elegance in Wisbech, we pride ourselves on:</p>
<ul>
  <li>Fully qualified and experienced permanent makeup artists</li>
  <li>Strict hygiene and safety protocols</li>
  <li>Premium quality pigments and equipment</li>
  <li>Personalized consultations to achieve your desired look</li>
  <li>Excellent aftercare support</li>
</ul>

<blockquote>"The permanent makeup procedure at Noble Elegance was comfortable and the results exceeded my expectations. I wake up feeling beautiful every day!" - Sarah, Wisbech</blockquote>

<h2>Book Your Consultation Today</h2>
<p>Ready to experience the convenience and confidence of ${name.toLowerCase()}? Contact Noble Elegance at our Wisbech salon on <strong>+44 7928 775746</strong> or book online. We serve clients from Wisbech, March, King's Lynn, Peterborough, and throughout Cambridgeshire.</p>

<p><em>Open Monday to Sunday, 9am-5pm at 12 Blackfriars Rd, Wisbech PE13 1AT</em></p>
`,
    tags: (name, category) => [
      "permanent makeup",
      "beauty treatments",
      "wisbech",
      category.toLowerCase().trim(),
    ],
  },

  Brows: {
    title: (name) => `${name}: Expert Brow Treatment in Wisbech`,
    excerpt: (name) =>
      `Transform your brows with ${name.toLowerCase()} at Noble Elegance. Professional results, stunning brows that last.`,
    content: (name) => `
<h2>Transform Your Brows with ${name}</h2>
<p>Beautiful, well-groomed brows frame your face and enhance your natural beauty. At Noble Elegance in Wisbech, our ${name.toLowerCase()} service delivers professional results that will have you loving your brows.</p>

<h2>What is ${name}?</h2>
<p>${name} is a professional treatment that enhances the appearance of your eyebrows, creating fuller, more defined, and perfectly shaped brows. Our skilled specialists in Wisbech use premium products and proven techniques to deliver stunning results.</p>

<h2>Benefits</h2>
<ul>
  <li><strong>Fuller-Looking Brows:</strong> Create the appearance of thicker, more defined eyebrows</li>
  <li><strong>Perfect Shape:</strong> Achieve symmetrical, beautifully shaped brows</li>
  <li><strong>Low Maintenance:</strong> Wake up with perfect brows every day</li>
  <li><strong>Long-Lasting:</strong> Results typically last 4-6 weeks</li>
  <li><strong>Natural Appearance:</strong> Enhances your natural brow beauty</li>
</ul>

<h2>The Treatment Process</h2>
<p>Your ${name.toLowerCase()} appointment at Noble Elegance includes:</p>
<ol>
  <li><strong>Consultation:</strong> Discussing your desired brow shape and style</li>
  <li><strong>Preparation:</strong> Cleansing and preparing the brow area</li>
  <li><strong>Application:</strong> Professional application of treatment products</li>
  <li><strong>Setting:</strong> Allowing the treatment to process for optimal results</li>
  <li><strong>Finishing Touches:</strong> Shaping and styling your brows to perfection</li>
</ol>

<h2>Who is This Treatment For?</h2>
<p>${name} is perfect for:</p>
<ul>
  <li>Those with thin or sparse eyebrows</li>
  <li>Anyone wanting more defined, shaped brows</li>
  <li>People with unruly or downward-growing brow hairs</li>
  <li>Busy individuals seeking low-maintenance beauty solutions</li>
  <li>Anyone preparing for a special occasion</li>
</ul>

<h2>Aftercare Advice</h2>
<p>To maintain your beautiful results:</p>
<ul>
  <li>Avoid getting brows wet for 24 hours</li>
  <li>Don't apply makeup to the brow area for 24 hours</li>
  <li>Avoid touching or rubbing the treated area</li>
  <li>Use a brow serum or conditioning oil to maintain health</li>
  <li>Book regular maintenance appointments every 4-6 weeks</li>
</ul>

<h2>Book Your Brow Appointment</h2>
<p>Experience the difference professional ${name.toLowerCase()} can make. Visit Noble Elegance at 12 Blackfriars Rd, Wisbech PE13 1AT, or call <strong>+44 7928 775746</strong> to book your appointment. Serving Wisbech, March, King's Lynn, and Peterborough.</p>
`,
    tags: (name, category) => [
      "brows",
      "eyebrows",
      "beauty treatments",
      "wisbech",
    ],
  },

  Injections: {
    title: (name) => `${name}: Professional Injectable Treatments in Wisbech`,
    excerpt: (name) =>
      `Discover ${name.toLowerCase()} at Noble Elegance - expert injectable treatments delivering natural-looking results in Wisbech, Cambridgeshire.`,
    content: (name) => `
<h2>Expert ${name} at Noble Elegance</h2>
<p>At Noble Elegance in Wisbech, we offer professional ${name.toLowerCase()} treatments delivered by our experienced aesthetic practitioners. Using premium products and advanced techniques, we help you achieve natural-looking, beautiful results.</p>

<h2>What Are ${name}?</h2>
<p>${name} are advanced aesthetic treatments that enhance your natural features, reduce signs of aging, or address specific cosmetic concerns. Our practitioners have extensive training and experience in delivering safe, effective injectable treatments.</p>

<h2>Benefits of ${name}</h2>
<ul>
  <li><strong>Natural Results:</strong> Subtle enhancements that look like you, just better</li>
  <li><strong>Quick Treatment:</strong> Most procedures take 30-60 minutes</li>
  <li><strong>Minimal Downtime:</strong> Return to daily activities immediately</li>
  <li><strong>Long-Lasting:</strong> Results can last 6-18 months depending on treatment</li>
  <li><strong>Safe & Effective:</strong> FDA-approved products and techniques</li>
  <li><strong>Customizable:</strong> Tailored to your individual needs and goals</li>
</ul>

<h2>The Treatment Process</h2>
<p>Your ${name.toLowerCase()} journey at Noble Elegance includes:</p>
<ol>
  <li><strong>Comprehensive Consultation:</strong> Discussing your goals, medical history, and expectations</li>
  <li><strong>Treatment Planning:</strong> Creating a personalized treatment plan</li>
  <li><strong>Preparation:</strong> Cleansing the treatment area and applying topical numbing if needed</li>
  <li><strong>Injection:</strong> Precise application of the treatment using fine needles</li>
  <li><strong>Aftercare Guidance:</strong> Detailed instructions for optimal results</li>
  <li><strong>Follow-Up:</strong> Review appointment to assess results</li>
</ol>

<h2>Who is This Treatment For?</h2>
<p>${name} may be suitable for you if:</p>
<ul>
  <li>You want to enhance your natural features</li>
  <li>You're looking to reduce signs of aging</li>
  <li>You desire non-surgical cosmetic improvements</li>
  <li>You're in good general health</li>
  <li>You have realistic expectations about results</li>
</ul>

<h2>What to Expect</h2>
<h3>During Treatment</h3>
<p>Most clients experience minimal discomfort during the procedure. We use fine needles and can apply numbing cream for your comfort. The treatment typically takes 30-60 minutes.</p>

<h3>After Treatment</h3>
<p>You may experience mild swelling, redness, or bruising at injection sites. These side effects are temporary and typically resolve within a few days. Results develop gradually over the following weeks.</p>

<h2>Aftercare Instructions</h2>
<ul>
  <li>Avoid touching or massaging the treated area for 24 hours</li>
  <li>Stay upright for 4 hours post-treatment</li>
  <li>Avoid strenuous exercise for 24 hours</li>
  <li>Don't apply makeup for 24 hours</li>
  <li>Avoid alcohol, hot baths, and saunas for 48 hours</li>
  <li>Stay hydrated and avoid excessive sun exposure</li>
</ul>

<h2>Why Choose Noble Elegance?</h2>
<p>When you choose Noble Elegance for ${name.toLowerCase()}, you benefit from:</p>
<ul>
  <li>Qualified and experienced aesthetic practitioners</li>
  <li>Premium, authentic products</li>
  <li>Personalized treatment plans</li>
  <li>Safe, clinical environment</li>
  <li>Comprehensive aftercare support</li>
  <li>Natural-looking results</li>
</ul>

<blockquote>"I was nervous about trying injectables, but the team at Noble Elegance made me feel so comfortable. The results are exactly what I wanted - natural and subtle!" - Emma, March</blockquote>

<h2>Book Your Consultation</h2>
<p>Ready to discover how ${name.toLowerCase()} can enhance your natural beauty? Contact Noble Elegance on <strong>+44 7928 775746</strong> or visit us at 12 Blackfriars Rd, Wisbech PE13 1AT. We welcome clients from Wisbech, March, King's Lynn, Peterborough, Downham Market, and Chatteris.</p>

<p><em>Open 7 days a week, 9am-5pm. Book your consultation today!</em></p>
`,
    tags: (name, category) => [
      "injectables",
      "aesthetic treatments",
      "anti-aging",
      "wisbech",
      "dermal fillers",
    ],
  },

  "Face treatment": {
    title: (name) => `${name}: Professional Facial Treatment in Wisbech`,
    excerpt: (name) =>
      `Experience ${name.toLowerCase()} at Noble Elegance - professional facial treatments for beautiful, healthy skin in Wisbech.`,
    content: (name) => `
<h2>${name} at Noble Elegance</h2>
<p>Treat your skin to the luxury it deserves with ${name.toLowerCase()} at Noble Elegance in Wisbech. Our professional facial treatments combine advanced techniques with premium products to deliver visible, lasting results.</p>

<h2>What is ${name}?</h2>
<p>${name} is a professional skincare treatment designed to cleanse, exfoliate, nourish, and rejuvenate your skin. Our experienced specialists customize each treatment to address your specific skin concerns and goals.</p>

<h2>Benefits</h2>
<ul>
  <li><strong>Deep Cleansing:</strong> Removes impurities and unclogs pores</li>
  <li><strong>Improved Skin Texture:</strong> Smoother, softer, more radiant skin</li>
  <li><strong>Enhanced Hydration:</strong> Deeply moisturized, plump skin</li>
  <li><strong>Reduced Signs of Aging:</strong> Minimizes fine lines and wrinkles</li>
  <li><strong>Even Skin Tone:</strong> Reduces pigmentation and redness</li>
  <li><strong>Relaxation:</strong> Enjoy a peaceful, pampering experience</li>
</ul>

<h2>The Treatment Process</h2>
<p>Your ${name.toLowerCase()} experience at Noble Elegance includes:</p>
<ol>
  <li><strong>Skin Analysis:</strong> Assessing your skin type and concerns</li>
  <li><strong>Cleansing:</strong> Gentle removal of makeup and impurities</li>
  <li><strong>Exfoliation:</strong> Removing dead skin cells for a fresh glow</li>
  <li><strong>Treatment Application:</strong> Customized serums and masks</li>
  <li><strong>Massage:</strong> Relaxing facial massage to boost circulation</li>
  <li><strong>Moisturizing:</strong> Hydrating and protecting your skin</li>
  <li><strong>SPF Protection:</strong> Final layer of sun protection</li>
</ol>

<h2>Who Should Try This Treatment?</h2>
<p>${name} is ideal for:</p>
<ul>
  <li>All skin types and ages</li>
  <li>Those with specific skin concerns</li>
  <li>Anyone seeking relaxation and self-care</li>
  <li>Pre-event skin preparation</li>
  <li>Regular skincare maintenance</li>
</ul>

<h2>Recommended Treatment Frequency</h2>
<p>For optimal results, we recommend:</p>
<ul>
  <li><strong>Maintenance:</strong> Monthly treatments to maintain healthy skin</li>
  <li><strong>Problem Skin:</strong> Fortnightly treatments until improvements are seen</li>
  <li><strong>Anti-Aging:</strong> Every 3-4 weeks for continued benefits</li>
  <li><strong>Special Occasions:</strong> 1-2 weeks before events for glowing skin</li>
</ul>

<h2>Aftercare Tips</h2>
<p>To maximize your treatment results:</p>
<ul>
  <li>Avoid makeup for at least 4 hours post-treatment</li>
  <li>Use a gentle cleanser and moisturizer</li>
  <li>Apply SPF daily to protect your skin</li>
  <li>Stay hydrated by drinking plenty of water</li>
  <li>Avoid harsh skincare products for 48 hours</li>
  <li>Book regular treatments for ongoing benefits</li>
</ul>

<h2>What Makes Our Treatments Special?</h2>
<p>At Noble Elegance, you can expect:</p>
<ul>
  <li>Qualified and experienced facial therapists</li>
  <li>Premium, professional-grade products</li>
  <li>Customized treatments for your skin type</li>
  <li>Relaxing, spa-like atmosphere</li>
  <li>Thorough skin analysis and consultation</li>
  <li>Excellent hygiene standards</li>
</ul>

<blockquote>"The ${name.toLowerCase()} at Noble Elegance is my monthly treat to myself. My skin has never looked better!" - Lisa, Wisbech</blockquote>

<h2>Book Your Facial Treatment Today</h2>
<p>Give your skin the care it deserves with ${name.toLowerCase()} at Noble Elegance. Call <strong>+44 7928 775746</strong> or visit us at 12 Blackfriars Rd, Wisbech PE13 1AT to book your appointment. Serving Wisbech, March, King's Lynn, Peterborough, and surrounding areas.</p>

<p><em>Open Monday-Sunday, 9am-5pm</em></p>
`,
    tags: (name, category) => [
      "facial treatments",
      "skincare",
      "beauty",
      "wisbech",
      "anti-aging",
    ],
  },

  Hair: {
    title: (name) => `${name}: Expert Hair Services in Wisbech`,
    excerpt: (name) =>
      `Transform your hair with ${name.toLowerCase()} at Noble Elegance. Professional hair services in Wisbech by experienced stylists.`,
    content: (name) => `
<h2>Professional ${name} at Noble Elegance</h2>
<p>Your hair deserves the best care, and at Noble Elegance in Wisbech, our experienced hair stylists deliver exceptional ${name.toLowerCase()} services using premium products and the latest techniques.</p>

<h2>Why Choose Our ${name} Service?</h2>
<p>When you choose Noble Elegance for ${name.toLowerCase()}, you're choosing:</p>
<ul>
  <li><strong>Expert Stylists:</strong> Qualified professionals with years of experience</li>
  <li><strong>Premium Products:</strong> High-quality, professional-grade hair care</li>
  <li><strong>Personalized Service:</strong> Customized to your hair type and goals</li>
  <li><strong>Comfortable Environment:</strong> Relaxing salon atmosphere</li>
  <li><strong>Competitive Prices:</strong> Excellent value for professional services</li>
</ul>

<h2>The Process</h2>
<p>Your ${name.toLowerCase()} appointment includes:</p>
<ol>
  <li><strong>Consultation:</strong> Discussing your hair goals and concerns</li>
  <li><strong>Hair Analysis:</strong> Assessing your hair type and condition</li>
  <li><strong>Professional Service:</strong> Expert application of techniques</li>
  <li><strong>Styling:</strong> Finishing touches for beautiful results</li>
  <li><strong>Aftercare Advice:</strong> Tips for maintaining your results at home</li>
</ol>

<h2>Benefits</h2>
<ul>
  <li>Healthy, beautiful hair</li>
  <li>Professional results that last</li>
  <li>Personalized treatment for your hair type</li>
  <li>Expert advice and guidance</li>
  <li>Relaxing salon experience</li>
</ul>

<h2>Aftercare Tips</h2>
<p>To maintain your beautiful results:</p>
<ul>
  <li>Use sulfate-free shampoo and conditioner</li>
  <li>Apply heat protection before styling</li>
  <li>Minimize heat styling when possible</li>
  <li>Deep condition weekly</li>
  <li>Trim regularly to prevent split ends</li>
  <li>Book regular salon appointments</li>
</ul>

<h2>Who Is This Service For?</h2>
<p>Our ${name.toLowerCase()} service is perfect for:</p>
<ul>
  <li>Anyone wanting professional hair care</li>
  <li>Those seeking to improve hair health</li>
  <li>People preparing for special occasions</li>
  <li>Clients wanting low-maintenance styles</li>
  <li>Anyone looking for a confidence boost</li>
</ul>

<h2>Book Your Hair Appointment</h2>
<p>Ready for beautiful, healthy hair? Contact Noble Elegance on <strong>+44 7928 775746</strong> or visit our salon at 12 Blackfriars Rd, Wisbech PE13 1AT. We welcome clients from Wisbech, March, King's Lynn, Peterborough, and throughout Cambridgeshire.</p>

<p><em>Open 7 days, 9am-5pm</em></p>
`,
    tags: (name, category) => [
      "hair",
      "hair styling",
      "beauty salon",
      "wisbech",
      "hair care",
    ],
  },

  Waxing: {
    title: (name) => `${name}: Professional Waxing Services in Wisbech`,
    excerpt: (name) =>
      `Smooth, hair-free skin with ${name.toLowerCase()} at Noble Elegance. Professional waxing in Wisbech using gentle techniques.`,
    content: (name) => `
<h2>Professional ${name} at Noble Elegance</h2>
<p>Achieve smooth, hair-free skin with ${name.toLowerCase()} at Noble Elegance in Wisbech. Our experienced specialists use premium wax and gentle techniques for comfortable, effective hair removal.</p>

<h2>Benefits of ${name}</h2>
<ul>
  <li><strong>Smooth Skin:</strong> Enjoy silky-smooth, hair-free skin for weeks</li>
  <li><strong>Long-Lasting Results:</strong> Results typically last 3-6 weeks</li>
  <li><strong>Finer Regrowth:</strong> Hair grows back softer and finer over time</li>
  <li><strong>No Stubble:</strong> Unlike shaving, no prickly regrowth</li>
  <li><strong>Exfoliation:</strong> Waxing also removes dead skin cells</li>
  <li><strong>Quick Treatment:</strong> Most services take 15-30 minutes</li>
</ul>

<h2>What to Expect</h2>
<p>During your ${name.toLowerCase()} appointment:</p>
<ol>
  <li><strong>Preparation:</strong> The area is cleansed and prepared</li>
  <li><strong>Wax Application:</strong> Premium wax is applied to the area</li>
  <li><strong>Hair Removal:</strong> Quick, efficient removal technique</li>
  <li><strong>Soothing Treatment:</strong> Calming lotion applied</li>
  <li><strong>Aftercare Advice:</strong> Tips for maintaining smooth skin</li>
</ol>

<h2>Pre-Waxing Tips</h2>
<p>For the best results:</p>
<ul>
  <li>Ensure hair is at least 5mm long (about 2 weeks growth)</li>
  <li>Exfoliate the area 24 hours before</li>
  <li>Avoid sun exposure for 24 hours prior</li>
  <li>Don't apply lotions or oils on the day</li>
  <li>Avoid caffeine before your appointment</li>
</ul>

<h2>Aftercare Instructions</h2>
<p>To maintain your smooth skin:</p>
<ul>
  <li>Avoid hot baths, saunas, and steam rooms for 24 hours</li>
  <li>Don't apply deodorant or perfume to waxed areas for 24 hours</li>
  <li>Wear loose clothing to prevent irritation</li>
  <li>Avoid sun exposure for 24-48 hours</li>
  <li>Exfoliate regularly to prevent ingrown hairs</li>
  <li>Moisturize daily for smooth skin</li>
  <li>Book regular appointments every 4-6 weeks</li>
</ul>

<h2>Why Choose Noble Elegance?</h2>
<ul>
  <li>Experienced, professional specialists</li>
  <li>Premium quality wax for sensitive skin</li>
  <li>Hygienic, private treatment rooms</li>
  <li>Comfortable, professional environment</li>
  <li>Affordable prices</li>
  <li>Flexible appointment times</li>
</ul>

<blockquote>"I've tried many salons, but Noble Elegance is by far the best for waxing. The staff are gentle, professional, and the results are always perfect!" - Rachel, March</blockquote>

<h2>Book Your Waxing Appointment</h2>
<p>Ready for smooth, beautiful skin? Call Noble Elegance on <strong>+44 7928 775746</strong> or visit us at 12 Blackfriars Rd, Wisbech PE13 1AT. Serving Wisbech, March, King's Lynn, Peterborough, Downham Market, and Chatteris.</p>

<p><em>Open Monday-Sunday, 9am-5pm</em></p>
`,
    tags: (name, category) => [
      "waxing",
      "hair removal",
      "beauty treatments",
      "wisbech",
      "smooth skin",
    ],
  },

  default: {
    title: (name) => `${name}: Premium Beauty Treatment in Wisbech`,
    excerpt: (name) =>
      `Discover ${name.toLowerCase()} at Noble Elegance - professional beauty treatments in Wisbech, Cambridgeshire.`,
    content: (name) => `
<h2>${name} at Noble Elegance</h2>
<p>Experience ${name.toLowerCase()} at Noble Elegance in Wisbech. Our skilled beauty professionals deliver exceptional results using premium products and advanced techniques.</p>

<h2>What is ${name}?</h2>
<p>${name} is a professional beauty treatment designed to enhance your natural features and help you look and feel your best. Our experienced team customizes each treatment to meet your individual needs and goals.</p>

<h2>Benefits</h2>
<ul>
  <li>Professional, high-quality results</li>
  <li>Customized to your needs</li>
  <li>Experienced beauty professionals</li>
  <li>Premium products and equipment</li>
  <li>Relaxing salon environment</li>
  <li>Excellent value for money</li>
</ul>

<h2>The Treatment Process</h2>
<ol>
  <li><strong>Consultation:</strong> We discuss your goals and expectations</li>
  <li><strong>Preparation:</strong> The treatment area is prepared</li>
  <li><strong>Application:</strong> Professional application of the treatment</li>
  <li><strong>Finishing Touches:</strong> Final details for perfect results</li>
  <li><strong>Aftercare:</strong> Guidance for maintaining your results</li>
</ol>

<h2>Why Choose Noble Elegance?</h2>
<p>When you visit Noble Elegance for ${name.toLowerCase()}, you benefit from:</p>
<ul>
  <li>Qualified and experienced beauty professionals</li>
  <li>High-quality, professional-grade products</li>
  <li>Personalized service and attention</li>
  <li>Clean, comfortable salon environment</li>
  <li>Competitive pricing</li>
  <li>Convenient Wisbech location</li>
</ul>

<h2>Who Is This Treatment For?</h2>
<p>${name} is suitable for anyone looking to enhance their appearance and boost their confidence. Whether you're preparing for a special occasion or simply treating yourself, we're here to help you look and feel amazing.</p>

<h2>Aftercare</h2>
<p>We'll provide you with detailed aftercare instructions to ensure you get the best possible results from your ${name.toLowerCase()} treatment. Our team is always available to answer any questions you may have.</p>

<h2>Book Your Appointment Today</h2>
<p>Ready to experience ${name.toLowerCase()} at Noble Elegance? Call us on <strong>+44 7928 775746</strong> or visit our salon at 12 Blackfriars Rd, Wisbech PE13 1AT. We welcome clients from Wisbech, March, King's Lynn, Peterborough, and throughout Cambridgeshire.</p>

<p><em>Open Monday-Sunday, 9am-5pm</em></p>
`,
    tags: (name, category) => [
      "beauty treatments",
      "wisbech",
      category.toLowerCase().trim(),
      "noble elegance",
    ],
  },
};

function getTemplate(category) {
  const cat = category.trim();

  if (cat.includes("Permanent makeup"))
    return blogTemplates["Permanent makeup"];
  if (cat.includes("Brow")) return blogTemplates["Brows"];
  if (cat.includes("Injection")) return blogTemplates["Injections"];
  if (cat.includes("Face") || cat.includes("Skin"))
    return blogTemplates["Face treatment"];
  if (cat.includes("Hair")) return blogTemplates["Hair"];
  if (cat.includes("Waxing")) return blogTemplates["Waxing"];

  return blogTemplates["default"];
}

async function createBlogPosts() {
  try {
    // Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB");

    // Get the first admin user to use as author
    const admin = await Admin.findOne().sort({ createdAt: 1 });

    if (!admin) {
      console.error(
        "✗ No admin user found. Please create an admin user first."
      );
      process.exit(1);
    }

    console.log(`✓ Using admin: ${admin.name} (${admin.email})`);

    // Remove duplicate services
    const uniqueServices = [];
    const seenNames = new Set();

    for (const service of services) {
      const normalizedName = service.name.trim().toLowerCase();
      if (!seenNames.has(normalizedName)) {
        seenNames.add(normalizedName);
        uniqueServices.push(service);
      }
    }

    console.log(`\n📝 Creating ${uniqueServices.length} blog posts...`);

    let created = 0;
    let skipped = 0;

    for (const service of uniqueServices) {
      const serviceName = service.name.trim();
      const template = getTemplate(service.category);

      // Generate blog post data
      const blogData = {
        title: template.title(serviceName),
        excerpt: template.excerpt(serviceName),
        content: template.content(serviceName),
        author: admin._id,
        status: "published",
        tags: template.tags(serviceName, service.category),
      };

      // Check if blog post with similar title already exists
      const existingPost = await BlogPost.findOne({
        title: { $regex: new RegExp(serviceName, "i") },
      });

      if (existingPost) {
        console.log(`⊘ Skipped: "${serviceName}" (already exists)`);
        skipped++;
        continue;
      }

      // Create the blog post
      await BlogPost.create(blogData);
      console.log(`✓ Created: "${blogData.title}"`);
      created++;
    }

    console.log(`\n✅ Blog post creation complete!`);
    console.log(`   Created: ${created} posts`);
    console.log(`   Skipped: ${skipped} posts (duplicates)`);
    console.log(`   Total: ${uniqueServices.length} services processed`);
  } catch (error) {
    console.error("✗ Error creating blog posts:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB");
  }
}

// Run the script
createBlogPosts();
