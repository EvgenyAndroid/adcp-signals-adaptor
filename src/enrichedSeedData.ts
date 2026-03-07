// src/enrichedSeedData.ts
// New public datasets: Census ACS 2022, Nielsen DMA, IAB Cross-Taxonomy Bridge

export const censusAcsCsv = `acs_b01001,acs_b19001,acs_b15003,acs_b11001,age_band,income_band,education,household_type,region,census_region_code,estimated_households,margin_of_error,data_year
B01001_007,B19001_002,B15003_017,B11001_003,18-24,under_50k,high_school,single,northeast,1,1240000,52000,2022
B01001_007,B19001_002,B15003_018,B11001_003,18-24,under_50k,some_college,single,south,3,1580000,63000,2022
B01001_007,B19001_005,B15003_018,B11001_003,18-24,50k_100k,some_college,single,west,4,720000,38000,2022
B01001_007,B19001_005,B15003_021,B11001_003,18-24,50k_100k,bachelors,single,midwest,2,560000,31000,2022
B01001_011,B19001_002,B15003_018,B11001_003,25-34,under_50k,some_college,single,south,3,1650000,67000,2022
B01001_011,B19001_005,B15003_021,B11001_003,25-34,50k_100k,bachelors,single,northeast,1,1320000,54000,2022
B01001_011,B19001_005,B15003_021,B11001_002,25-34,50k_100k,bachelors,couple_no_kids,west,4,1140000,48000,2022
B01001_011,B19001_008,B15003_021,B11001_002,25-34,100k_150k,bachelors,couple_no_kids,west,4,790000,39000,2022
B01001_011,B19001_011,B15003_022,B11001_002,25-34,150k_plus,graduate,couple_no_kids,northeast,1,470000,28000,2022
B01001_011,B19001_011,B15003_022,B11001_003,25-34,150k_plus,graduate,single,west,4,440000,27000,2022
B01001_013,B19001_005,B15003_021,B11001_005,35-44,50k_100k,bachelors,family_with_kids,south,3,1820000,72000,2022
B01001_013,B19001_008,B15003_021,B11001_005,35-44,100k_150k,bachelors,family_with_kids,northeast,1,1180000,49000,2022
B01001_013,B19001_008,B15003_022,B11001_005,35-44,100k_150k,graduate,family_with_kids,west,4,970000,43000,2022
B01001_013,B19001_011,B15003_022,B11001_005,35-44,150k_plus,graduate,family_with_kids,northeast,1,640000,34000,2022
B01001_013,B19001_011,B15003_022,B11001_002,35-44,150k_plus,graduate,couple_no_kids,west,4,580000,32000,2022
B01001_015,B19001_005,B15003_021,B11001_005,45-54,50k_100k,bachelors,family_with_kids,midwest,2,1420000,58000,2022
B01001_015,B19001_008,B15003_021,B11001_005,45-54,100k_150k,bachelors,family_with_kids,south,3,1090000,46000,2022
B01001_015,B19001_011,B15003_022,B11001_002,45-54,150k_plus,graduate,couple_no_kids,northeast,1,850000,40000,2022
B01001_015,B19001_011,B15003_022,B11001_005,45-54,150k_plus,graduate,family_with_kids,west,4,740000,37000,2022
B01001_017,B19001_002,B15003_017,B11001_002,55-64,under_50k,high_school,couple_no_kids,south,3,1590000,64000,2022
B01001_017,B19001_005,B15003_018,B11001_004,55-64,50k_100k,some_college,senior_household,midwest,2,1340000,55000,2022
B01001_017,B19001_008,B15003_021,B11001_002,55-64,100k_150k,bachelors,couple_no_kids,northeast,1,780000,38000,2022
B01001_019,B19001_002,B15003_017,B11001_004,65+,under_50k,high_school,senior_household,south,3,2130000,82000,2022
B01001_019,B19001_005,B15003_018,B11001_004,65+,50k_100k,some_college,senior_household,midwest,2,1460000,59000,2022
B01001_019,B19001_008,B15003_021,B11001_004,65+,100k_150k,bachelors,senior_household,northeast,1,640000,34000,2022
B01001_011,B19001_011,B15003_022,B11001_003,25-34,150k_plus,graduate,single,northeast,1,380000,25000,2022
B01001_013,B19001_011,B15003_022,B11001_003,35-44,150k_plus,graduate,single,west,4,290000,21000,2022
B01001_011,B19001_008,B15003_021,B11001_003,25-34,100k_150k,bachelors,single,midwest,2,510000,29000,2022
B01001_015,B19001_005,B15003_021,B11001_002,45-54,50k_100k,bachelors,couple_no_kids,west,4,920000,42000,2022
B01001_017,B19001_011,B15003_022,B11001_002,55-64,150k_plus,graduate,couple_no_kids,west,4,560000,31000,2022`;

export const dmaNielsenCsv = `dma_code,dma_name,rank,tv_households,percent_us,states,region,metro_tier
501,New York,1,7520000,6.44,NY|NJ|CT,northeast,top_10
802,Los Angeles,2,5660000,4.85,CA,west,top_10
602,Chicago,3,3490000,2.99,IL|IN,midwest,top_10
504,Philadelphia,4,3040000,2.60,PA|NJ|DE,northeast,top_10
618,Dallas-Ft. Worth,5,2970000,2.54,TX,south,top_10
511,Boston,6,2630000,2.25,MA|NH|ME|RI|VT,northeast,top_10
803,San Francisco-Oakland-San Jose,7,2620000,2.24,CA,west,top_10
524,Washington DC,8,2570000,2.20,DC|MD|VA,south,top_10
561,Atlanta,9,2460000,2.11,GA,south,top_10
623,Houston,10,2450000,2.10,TX,south,top_10
527,Miami-Ft. Lauderdale,11,1760000,1.51,FL,south,top_25
637,Detroit,12,1740000,1.49,MI,midwest,top_25
641,Minneapolis-St. Paul,13,1760000,1.51,MN|WI,midwest,top_25
753,Phoenix,14,2050000,1.76,AZ,west,top_25
539,Tampa-St. Petersburg,15,1980000,1.70,FL,south,top_25
551,Seattle-Tacoma,16,1920000,1.64,WA|OR,west,top_25
517,Cleveland,17,1490000,1.28,OH,midwest,top_25
659,Denver,18,1770000,1.52,CO,west,top_25
544,Orlando-Daytona Beach,19,1720000,1.47,FL,south,top_25
613,Sacramento-Stockton-Modesto,20,1430000,1.22,CA,west,top_25
609,St. Louis,21,1230000,1.05,MO|IL,midwest,top_25
616,Charlotte,22,1170000,1.00,NC|SC,south,top_25
532,Portland,23,1200000,1.03,OR|WA,west,top_25
524,Baltimore,24,1160000,0.99,MD,south,top_25
512,Pittsburgh,25,1150000,0.98,PA,northeast,top_25
619,Indianapolis,26,1130000,0.97,IN,midwest,top_50
535,Raleigh-Durham,27,1200000,1.03,NC,south,top_50
556,Nashville,28,1180000,1.01,TN,south,top_50
534,Hartford-New Haven,29,1090000,0.93,CT,northeast,top_50
513,San Diego,30,1100000,0.94,CA,west,top_50
542,Kansas City,31,1000000,0.86,MO|KS,midwest,top_50
545,Columbus,32,1000000,0.86,OH,midwest,top_50
558,Milwaukee,33,920000,0.79,WI,midwest,top_50
573,Salt Lake City,34,1030000,0.88,UT,west,top_50
543,Cincinnati,35,980000,0.84,OH|KY,midwest,top_50
548,San Antonio,36,1060000,0.91,TX,south,top_50
514,Buffalo,37,680000,0.58,NY,northeast,top_50
536,Norfolk-Portsmouth-Newport News,38,750000,0.64,VA,south,top_50
503,Albany-Schenectady-Troy,39,570000,0.49,NY,northeast,top_50
566,New Orleans,40,720000,0.62,LA,south,top_50
647,Oklahoma City,41,820000,0.70,OK,south,top_50
631,Louisville,42,740000,0.63,KY|IN,south,top_50
518,Austin,43,990000,0.85,TX,south,top_50
560,Memphis,44,720000,0.62,TN|AR|MS,south,top_50
576,Greenville-Spartanburg,45,790000,0.68,SC|NC,south,top_50
574,Harrisburg-Lancaster-York,46,760000,0.65,PA,northeast,top_50
549,Providence-New Bedford,47,700000,0.60,RI|MA,northeast,top_50
533,Jacksonville,48,790000,0.68,FL,south,top_50
603,Richmond-Petersburg,49,700000,0.60,VA,south,top_50
521,Charlotte Greensboro,50,680000,0.58,NC,south,top_50`;

export const taxonomyBridgeCsv = `audience_id,audience_name,audience_tier1,content_id,content_name,content_tier1,content_tier2,mapping_type,mapping_rationale,bidirectional
103,Action & Adventure,Interests & Hobbies,IAB1-1,Action & Adventure,Arts & Entertainment,Action & Adventure,strong,Direct genre match across both taxonomies,true
103,Action & Adventure,Interests & Hobbies,IAB17-18,Sports,Sports,,moderate,Action fans over-index on live sports content,false
103,Action & Adventure,Interests & Hobbies,IAB9-30,Video & Computer Games,Hobbies & Interests,Video & Computer Games,moderate,Action/gaming audience strong overlap,false
104,Science Fiction & Fantasy,Interests & Hobbies,IAB1-7,Science Fiction,Arts & Entertainment,Science Fiction,strong,Direct genre match,true
104,Science Fiction & Fantasy,Interests & Hobbies,IAB19,Technology & Computing,Technology & Computing,,moderate,Sci-fi audience indexes high on tech content,false
104,Science Fiction & Fantasy,Interests & Hobbies,IAB9-30,Video & Computer Games,Hobbies & Interests,Video & Computer Games,moderate,Gaming and sci-fi audience overlap,false
105,Drama,Interests & Hobbies,IAB1-3,Drama,Arts & Entertainment,Drama,strong,Direct genre match,true
105,Drama,Interests & Hobbies,IAB1-5,Entertainment,Arts & Entertainment,,moderate,Drama viewers consume broad entertainment content,false
106,Comedy,Interests & Hobbies,IAB1-2,Comedy,Arts & Entertainment,Comedy,strong,Direct genre match,true
106,Comedy,Interests & Hobbies,IAB1-5,Entertainment,Arts & Entertainment,,moderate,Comedy audience broadly engaged with entertainment,false
107,Documentary,Interests & Hobbies,IAB4,Education,Education,,moderate,Documentary viewers index high on educational content,false
107,Documentary,Interests & Hobbies,IAB1-10,News,Arts & Entertainment,News,strong,Documentary/news content audience overlap,true
107,Documentary,Interests & Hobbies,IAB15,Science,Science,,moderate,Nature/science documentary strong content affinity,false
109,Streaming TV,Interests & Hobbies,IAB1-5,Entertainment,Arts & Entertainment,,strong,Streaming viewers are the core entertainment content audience,true
109,Streaming TV,Interests & Hobbies,IAB1-1,Action & Adventure,Arts & Entertainment,Action & Adventure,moderate,Most-consumed streaming genre,false
109,Streaming TV,Interests & Hobbies,IAB1-7,Science Fiction,Arts & Entertainment,Science Fiction,moderate,Second most-consumed streaming genre,false
10,College Educated,Demographic,IAB4,Education,Education,,strong,College-educated audience indexes heavily on educational content,true
10,College Educated,Demographic,IAB15,Science,Science,,moderate,Higher education correlates with science content consumption,false
10,College Educated,Demographic,IAB12,News & Politics,News & Politics,,moderate,College-educated audiences are news heavy consumers,false
11,Graduate Educated,Demographic,IAB4,Education,Education,,strong,Graduate-educated audience over-indexes on in-depth educational content,true
11,Graduate Educated,Demographic,IAB15,Science,Science,,strong,Graduate degree holders index very high on science content,true
11,Graduate Educated,Demographic,IAB12,News & Politics,News & Politics,,moderate,High news consumption among graduate-educated,false
17,Over $150000,Demographic,IAB14,Personal Finance,Personal Finance,,strong,High income households are core personal finance content consumers,true
17,Over $150000,Demographic,IAB21,Real Estate,Real Estate,,strong,High income strong real estate content affinity,true
17,Over $150000,Demographic,IAB7,Health & Fitness,Health & Fitness,,moderate,High income indexes on premium health content,false
17,Over $150000,Demographic,IAB23,Travel,Travel,,strong,High income is the primary travel content audience,true
16,$100000-$150000,Demographic,IAB14,Personal Finance,Personal Finance,,moderate,Upper-middle income engages with financial planning content,false
16,$100000-$150000,Demographic,IAB23,Travel,Travel,,moderate,Strong travel content affinity,false
20,Family with Children,Demographic,IAB5,Family & Parenting,Family & Parenting,,strong,Families are the core family/parenting content audience,true
20,Family with Children,Demographic,IAB4,Education,Education,,strong,Parents heavily consume education-related content,true
20,Family with Children,Demographic,IAB1-2,Comedy,Arts & Entertainment,Comedy,moderate,Family entertainment content overlap,false
201,Technology Buyers,Purchase Behavior,IAB19,Technology & Computing,Technology & Computing,,strong,Tech buyers are the core technology content consumers,true
201,Technology Buyers,Purchase Behavior,IAB19-6,Internet Technology,Technology & Computing,Internet Technology,strong,Tech buyers engage deeply with internet/software content,true
202,Streaming Service Subscribers,Purchase Behavior,IAB1-5,Entertainment,Arts & Entertainment,,strong,Streaming subscribers define the entertainment content audience,true
202,Streaming Service Subscribers,Purchase Behavior,IAB1-1,Action & Adventure,Arts & Entertainment,Action & Adventure,strong,Top streaming genre,true
202,Streaming Service Subscribers,Purchase Behavior,IAB1-7,Science Fiction,Arts & Entertainment,Science Fiction,strong,Top streaming genre,true
301,Urban,Geographic,IAB13-11,Urban Exploration,Real Estate,Urban Exploration,moderate,Urban residents over-index on urban lifestyle content,false
301,Urban,Geographic,IAB14,Personal Finance,Personal Finance,,moderate,Urban residents are strong financial content consumers,false
401,Business Decision Makers,Professional,IAB3,Business,Business,,strong,BDMs are the core business content audience,true
401,Business Decision Makers,Professional,IAB12,News & Politics,News & Politics,,strong,BDMs are heavy news consumers,true
401,Business Decision Makers,Professional,IAB19,Technology & Computing,Technology & Computing,,moderate,BDMs consume significant tech content,false`;
