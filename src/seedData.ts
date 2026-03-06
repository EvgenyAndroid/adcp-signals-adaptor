// src/seedData.ts
export const taxonomyTsv = `Unique ID\tParent ID\tName\tTier 1\tTier 2\tTier 3\tExtension
1\t\tDemographic\t\t\t\t
2\t1\tAge\tDemographic\tAge\t\t
3\t2\t18-24\tDemographic\tAge\t18-24\t
4\t2\t25-34\tDemographic\tAge\t25-34\t
5\t2\t35-44\tDemographic\tAge\t35-44\t
6\t2\t45-54\tDemographic\tAge\t45-54\t
7\t2\t55-64\tDemographic\tAge\t55-64\t
8\t2\t65+\tDemographic\tAge\t65+\t
9\t1\tEducation\tDemographic\tEducation\t\t
10\t9\tCollege Educated\tDemographic\tEducation\tCollege Educated\t
11\t9\tGraduate Educated\tDemographic\tEducation\tGraduate Educated\t
12\t9\tHigh School\tDemographic\tEducation\tHigh School\t
13\t1\tHousehold Income\tDemographic\tHousehold Income\t\t
14\t13\tUnder $50,000\tDemographic\tHousehold Income\tUnder $50,000\t
15\t13\t$50,000-$100,000\tDemographic\tHousehold Income\t$50,000-$100,000\t
16\t13\t$100,000-$150,000\tDemographic\tHousehold Income\t$100,000-$150,000\t
17\t13\tOver $150,000\tDemographic\tHousehold Income\tOver $150,000\t
18\t1\tHousehold Composition\tDemographic\tHousehold Composition\t\t
19\t18\tSingle Adult\tDemographic\tHousehold Composition\tSingle Adult\t
20\t18\tFamily with Children\tDemographic\tHousehold Composition\tFamily with Children\t
21\t18\tCouple No Children\tDemographic\tHousehold Composition\tCouple No Children\t
22\t18\tSenior Household\tDemographic\tHousehold Composition\tSenior Household\t
100\t\tInterests & Hobbies\t\t\t\t
101\t100\tEntertainment\tInterests & Hobbies\tEntertainment\t\t
102\t101\tMovies\tInterests & Hobbies\tEntertainment\tMovies\t
103\t102\tAction & Adventure\tInterests & Hobbies\tEntertainment\tAction & Adventure\t
104\t102\tScience Fiction & Fantasy\tInterests & Hobbies\tEntertainment\tScience Fiction & Fantasy\t
105\t102\tDrama\tInterests & Hobbies\tEntertainment\tDrama\t
106\t102\tComedy\tInterests & Hobbies\tEntertainment\tComedy\t
107\t102\tDocumentary\tInterests & Hobbies\tEntertainment\tDocumentary\t
108\t101\tTelevision\tInterests & Hobbies\tEntertainment\tTelevision\t
109\t108\tStreaming TV\tInterests & Hobbies\tEntertainment\tStreaming TV\t
110\t101\tMusic\tInterests & Hobbies\tEntertainment\tMusic\t
200\t\tPurchase Behavior\t\t\t\t
201\t200\tTechnology Buyers\tPurchase Behavior\tTechnology\t\t
202\t200\tStreaming Service Subscribers\tPurchase Behavior\tStreaming\t\t
203\t200\tPremium Content Buyers\tPurchase Behavior\tPremium Content\t\t
300\t\tGeographic\t\t\t\t
301\t300\tUrban\tGeographic\tUrban\t\t
302\t300\tSuburban\tGeographic\tSuburban\t\t
303\t300\tTop 10 Metro\tGeographic\tMetro\tTop 10\t
304\t300\tTop 25 Metro\tGeographic\tMetro\tTop 25\t
305\t300\tTop 50 Metro\tGeographic\tMetro\tTop 50\t
400\t\tProfessional\t\t\t\t
401\t400\tBusiness Decision Makers\tProfessional\tBusiness\t\t
402\t400\tIT Decision Makers\tProfessional\tTechnology\t\t
403\t400\tMarketing Professionals\tProfessional\tMarketing\t\t`;

export const demographicsCsv = `age_band,income_band,education,household_type,region,metro_tier,estimated_count
18-24,under_50k,high_school,single,northeast,top_25,850000
18-24,under_50k,some_college,single,south,top_50,920000
18-24,50k_100k,some_college,single,west,top_10,480000
18-24,50k_100k,bachelors,single,midwest,top_50,390000
25-34,under_50k,some_college,single,south,other,1100000
25-34,50k_100k,bachelors,single,northeast,top_10,870000
25-34,50k_100k,bachelors,couple_no_kids,west,top_10,760000
25-34,100k_150k,bachelors,couple_no_kids,west,top_25,520000
25-34,150k_plus,graduate,couple_no_kids,northeast,top_10,310000
25-34,150k_plus,graduate,single,west,top_10,290000
35-44,50k_100k,bachelors,family_with_kids,south,top_50,1200000
35-44,100k_150k,bachelors,family_with_kids,northeast,top_25,780000
35-44,100k_150k,graduate,family_with_kids,west,top_10,640000
35-44,150k_plus,graduate,family_with_kids,northeast,top_10,420000
35-44,150k_plus,graduate,couple_no_kids,west,top_25,380000
45-54,50k_100k,bachelors,family_with_kids,midwest,other,950000
45-54,100k_150k,bachelors,family_with_kids,south,top_50,720000
45-54,150k_plus,graduate,couple_no_kids,northeast,top_10,560000
45-54,150k_plus,graduate,family_with_kids,west,top_25,490000
55-64,under_50k,high_school,couple_no_kids,south,other,1050000
55-64,50k_100k,some_college,senior_household,midwest,other,880000
55-64,100k_150k,bachelors,couple_no_kids,northeast,top_50,510000
65+,under_50k,high_school,senior_household,south,other,1400000
65+,50k_100k,some_college,senior_household,midwest,other,960000
65+,100k_150k,bachelors,senior_household,northeast,top_50,420000`;

export const interestsCsv = `genre,affinity_score,age_band,income_band,metro_tier,estimated_count
action,0.72,18-24,under_50k,top_25,680000
action,0.68,25-34,50k_100k,top_10,590000
action,0.61,25-34,100k_150k,top_25,410000
action,0.55,35-44,50k_100k,top_50,520000
sci_fi,0.78,18-24,under_50k,top_25,430000
sci_fi,0.82,25-34,50k_100k,top_10,510000
sci_fi,0.75,25-34,150k_plus,top_10,280000
sci_fi,0.65,35-44,100k_150k,top_25,340000
drama,0.70,35-44,100k_150k,top_50,590000
drama,0.74,45-54,50k_100k,other,640000
drama,0.68,55-64,100k_150k,top_50,410000
comedy,0.65,18-24,under_50k,top_50,750000
comedy,0.62,25-34,50k_100k,top_25,620000
comedy,0.59,35-44,50k_100k,other,580000
documentary,0.72,35-44,100k_150k,top_10,320000
documentary,0.78,45-54,150k_plus,top_10,260000
documentary,0.70,55-64,100k_150k,top_25,290000
thriller,0.68,25-34,50k_100k,top_10,480000
thriller,0.64,35-44,100k_150k,top_25,390000
animation,0.75,18-24,under_50k,top_50,520000
animation,0.60,25-34,50k_100k,top_25,380000
romance,0.65,25-34,under_50k,other,460000
romance,0.70,35-44,50k_100k,other,510000
streaming_high,0.85,18-24,50k_100k,top_10,690000
streaming_high,0.88,25-34,100k_150k,top_10,760000
streaming_high,0.82,35-44,150k_plus,top_25,530000
streaming_medium,0.60,45-54,50k_100k,top_50,820000
streaming_medium,0.55,55-64,50k_100k,other,710000`;

export const geoCsv = `city,state,metro_tier,region,estimated_population
New York,NY,top_10,northeast,8336817
Los Angeles,CA,top_10,west,3979576
Chicago,IL,top_10,midwest,2693976
Houston,TX,top_10,south,2304580
Phoenix,AZ,top_10,west,1608139
Philadelphia,PA,top_10,northeast,1603797
San Antonio,TX,top_10,south,1434625
San Diego,CA,top_10,west,1386932
Dallas,TX,top_10,south,1304379
San Jose,CA,top_10,west,1013240
Austin,TX,top_25,south,961855
Jacksonville,FL,top_25,south,949611
Fort Worth,TX,top_25,south,918915
Columbus,OH,top_25,midwest,905748
Charlotte,NC,top_25,south,874579
Indianapolis,IN,top_25,midwest,867125
San Francisco,CA,top_25,west,881549
Seattle,WA,top_25,west,737255
Denver,CO,top_25,west,727211
Washington,DC,top_25,northeast,689545
Nashville,TN,top_50,south,689447
Oklahoma City,OK,top_50,south,681054
El Paso,TX,top_50,south,678815
Boston,MA,top_50,northeast,675647
Las Vegas,NV,top_50,west,641903
Portland,OR,top_50,west,652503
Memphis,TN,top_50,south,633104
Louisville,KY,top_50,south,620118
Baltimore,MD,top_50,northeast,585708
Milwaukee,WI,top_50,midwest,577222`;
