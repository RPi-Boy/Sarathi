// Static reference data for the seed. Airports, stations, hotel names and train numbers are real;
// every schedule, fare, rating and price derived from them is SAMPLE DATA, not live inventory.

// name, state, lat, lng, aliases
const CITIES = [
  ['Delhi', 'Delhi', 28.6139, 77.209, 'New Delhi,NCR'],
  ['Mumbai', 'Maharashtra', 19.076, 72.8777, 'Bombay'],
  ['Bengaluru', 'Karnataka', 12.9716, 77.5946, 'Bangalore,Bengaluru City'],
  ['Chennai', 'Tamil Nadu', 13.0827, 80.2707, 'Madras'],
  ['Kolkata', 'West Bengal', 22.5726, 88.3639, 'Calcutta'],
  ['Hyderabad', 'Telangana', 17.385, 78.4867, 'Secunderabad'],
  ['Goa', 'Goa', 15.4909, 73.8278, 'Panaji,Panjim,Margao,Madgaon,North Goa,South Goa'],
  ['Ahmedabad', 'Gujarat', 23.0225, 72.5714, 'Amdavad'],
  ['Pune', 'Maharashtra', 18.5204, 73.8567, 'Poona'],
  ['Jaipur', 'Rajasthan', 26.9124, 75.7873, 'Pink City'],
  ['Varanasi', 'Uttar Pradesh', 25.3176, 82.9739, 'Banaras,Benares,Kashi'],
  ['Kochi', 'Kerala', 9.9312, 76.2673, 'Cochin,Ernakulam,Fort Kochi'],
  ['Lucknow', 'Uttar Pradesh', 26.8467, 80.9462, ''],
  ['Amritsar', 'Punjab', 31.634, 74.8723, ''],
  ['Udaipur', 'Rajasthan', 24.5854, 73.7125, 'City of Lakes'],
  ['Srinagar', 'Jammu & Kashmir', 34.0837, 74.7973, 'Kashmir'],
  ['Bhopal', 'Madhya Pradesh', 23.2599, 77.4126, ''],
  ['Agra', 'Uttar Pradesh', 27.1767, 78.0081, 'Taj Mahal'],
  // Added later: keep appending (hotel ids are assigned in city order)
  ['Vellore', 'Tamil Nadu', 12.9165, 79.1325, 'Katpadi,VIT'],
  ['Londa', 'Karnataka', 15.4586, 74.5083, 'Londa Junction'],
  ['Mysuru', 'Karnataka', 12.2958, 76.6394, 'Mysore'],
  ['Sangli', 'Maharashtra', 16.8524, 74.5815, ''],
];

// iata, name, city
const AIRPORTS = [
  ['DEL', 'Indira Gandhi International Airport', 'Delhi'],
  ['BOM', 'Chhatrapati Shivaji Maharaj International Airport', 'Mumbai'],
  ['BLR', 'Kempegowda International Airport', 'Bengaluru'],
  ['MAA', 'Chennai International Airport', 'Chennai'],
  ['CCU', 'Netaji Subhas Chandra Bose International Airport', 'Kolkata'],
  ['HYD', 'Rajiv Gandhi International Airport', 'Hyderabad'],
  ['GOI', 'Dabolim Airport', 'Goa'],
  ['GOX', 'Manohar International Airport (Mopa)', 'Goa'],
  ['AMD', 'Sardar Vallabhbhai Patel International Airport', 'Ahmedabad'],
  ['PNQ', 'Pune Airport', 'Pune'],
  ['JAI', 'Jaipur International Airport', 'Jaipur'],
  ['VNS', 'Lal Bahadur Shastri International Airport', 'Varanasi'],
  ['COK', 'Cochin International Airport', 'Kochi'],
  ['LKO', 'Chaudhary Charan Singh International Airport', 'Lucknow'],
  ['ATQ', 'Sri Guru Ram Dass Jee International Airport', 'Amritsar'],
  ['UDR', 'Maharana Pratap Airport', 'Udaipur'],
  ['SXR', 'Sheikh ul-Alam International Airport', 'Srinagar'],
  ['BHO', 'Raja Bhoj Airport', 'Bhopal'],
];

// code, name, city
const STATIONS = [
  ['NDLS', 'New Delhi', 'Delhi'],
  ['BCT', 'Mumbai Central', 'Mumbai'],
  ['CSMT', 'Chhatrapati Shivaji Maharaj Terminus', 'Mumbai'],
  ['SBC', 'KSR Bengaluru City Junction', 'Bengaluru'],
  ['MAS', 'Chennai Central', 'Chennai'],
  ['HWH', 'Howrah Junction', 'Kolkata'],
  ['SC', 'Secunderabad Junction', 'Hyderabad'],
  ['MAO', 'Madgaon Junction', 'Goa'],
  ['ADI', 'Ahmedabad Junction', 'Ahmedabad'],
  ['PUNE', 'Pune Junction', 'Pune'],
  ['JP', 'Jaipur Junction', 'Jaipur'],
  ['BSB', 'Varanasi Junction', 'Varanasi'],
  ['ERS', 'Ernakulam Junction', 'Kochi'],
  ['LKO', 'Lucknow Charbagh', 'Lucknow'],
  ['ASR', 'Amritsar Junction', 'Amritsar'],
  ['UDZ', 'Udaipur City', 'Udaipur'],
  ['BPL', 'Bhopal Junction', 'Bhopal'],
  ['AGC', 'Agra Cantt', 'Agra'],
  ['KPD', 'Katpadi Junction', 'Vellore'],
  ['LD', 'Londa Junction', 'Londa'],
  ['MYS', 'Mysuru Junction', 'Mysuru'],
  ['SLI', 'Sangli', 'Sangli'],
  ['YPR', 'Yesvantpur Junction', 'Bengaluru'],
  ['VSG', 'Vasco da Gama', 'Goa'],
];

// code, name, fare multiplier, has business cabin, booking site
// listing_url values are the provider's own booking site (not a deep link to one flight).
const AIRLINES = [
  ['6E', 'IndiGo', 1.0, false, 'https://www.goindigo.in/'],
  ['AI', 'Air India', 1.22, true, 'https://www.airindia.com/'],
  ['IX', 'Air India Express', 0.93, false, 'https://www.airindiaexpress.com/'],
  ['QP', 'Akasa Air', 0.96, false, 'https://www.akasaair.com/'],
  ['SG', 'SpiceJet', 0.9, false, 'https://www.spicejet.com/'],
];

const TRAIN_BOOKING_URL = 'https://www.irctc.co.in/nget/train-search';

// hotels.chain -> official site. Chains not listed fall back to a web search for the property.
const CHAIN_URLS = {
  Taj: 'https://www.tajhotels.com/',
  'The Oberoi': 'https://www.oberoihotels.com/',
  Trident: 'https://www.tridenthotels.com/',
  'ITC Hotels': 'https://www.itchotels.com/',
  'The Leela': 'https://www.theleela.com/',
  Hyatt: 'https://www.hyatt.com/',
  Marriott: 'https://www.marriott.com/',
  Westin: 'https://www.marriott.com/',
  'W Hotels': 'https://www.marriott.com/',
  'Lemon Tree': 'https://www.lemontreehotels.com/',
  Ibis: 'https://all.accor.com/',
  Sofitel: 'https://all.accor.com/',
  Novotel: 'https://all.accor.com/',
  Radisson: 'https://www.radissonhotels.com/',
  'The Park': 'https://www.theparkhotels.com/',
  Hilton: 'https://www.hilton.com/',
  Fairmont: 'https://all.accor.com/',
  Alila: 'https://www.hyatt.com/',
  Zostel: 'https://www.zostel.com/',
  OYO: 'https://www.oyorooms.com/',
  Treebo: 'https://www.treebo.com/',
  Ramada: 'https://www.wyndhamhotels.com/',
  'The Lalit': 'https://www.thelalit.com/',
  Clarks: 'https://www.clarkshotels.com/',
  Fortune: 'https://www.fortunehotels.in/',
  'CGH Earth': 'https://www.cghearth.com/',
};

const HUB_AIRPORTS = ['DEL', 'BOM', 'BLR', 'MAA', 'CCU', 'HYD'];
const TRUNK_AIRPORTS = ['DEL', 'BOM', 'BLR']; // smaller airports only connect to these

// Per-km fare rates by train category (INR). Reservation fee is base_fare.
const FARE_RATES = {
  Rajdhani: { '3A': 2.1, '2A': 2.9, '1A': 4.7 },
  Shatabdi: { CC: 2.0, EC: 3.8 },
  'Vande Bharat': { CC: 2.3, EC: 4.3 },
  Superfast: { SL: 0.58, '3A': 1.6, '2A': 2.3, '1A': 3.8, CC: 1.8 },
  'Mail/Express': { SL: 0.55, '3A': 1.5, '2A': 2.2, '1A': 3.7, CC: 1.8 },
};

// number, name, category, [classes], stops: [station, arrTime|null, depTime|null, dayOffset], [operating days]
// Timetables for 16589, 17309, 17310, 20607 and 20608 follow public timetable sites (RailMitra, ConfirmTkt,
// ixigo; checked Oct 2026) and should be re-verified on IRCTC/NTES. Every other row is approximate SAMPLE data.
// Fares are always generated.
const TRAINS = [
  ['12951', 'Mumbai Rajdhani Express', 'Rajdhani', ['3A', '2A', '1A'], [['BCT', null, '16:55', 0], ['NDLS', '08:32', null, 1]]],
  ['12952', 'Mumbai Rajdhani Express', 'Rajdhani', ['3A', '2A', '1A'], [['NDLS', null, '16:35', 0], ['BCT', '08:35', null, 1]]],
  ['12301', 'Howrah Rajdhani Express', 'Rajdhani', ['3A', '2A', '1A'], [['HWH', null, '16:50', 0], ['NDLS', '09:55', null, 1]]],
  ['12302', 'Howrah Rajdhani Express', 'Rajdhani', ['3A', '2A', '1A'], [['NDLS', null, '16:55', 0], ['HWH', '10:05', null, 1]]],
  ['12002', 'Bhopal Shatabdi Express', 'Shatabdi', ['CC', 'EC'], [['NDLS', null, '06:00', 0], ['AGC', '07:55', '07:57', 0], ['BPL', '14:05', null, 0]]],
  ['12001', 'Bhopal Shatabdi Express', 'Shatabdi', ['CC', 'EC'], [['BPL', null, '05:55', 0], ['AGC', '11:50', '11:52', 0], ['NDLS', '14:25', null, 0]]],
  ['22436', 'Vande Bharat Express (New Delhi - Varanasi)', 'Vande Bharat', ['CC', 'EC'], [['NDLS', null, '06:00', 0], ['BSB', '14:00', null, 0]]],
  ['22435', 'Vande Bharat Express (Varanasi - New Delhi)', 'Vande Bharat', ['CC', 'EC'], [['BSB', null, '15:00', 0], ['NDLS', '23:00', null, 0]]],
  ['12009', 'Shatabdi Express (Mumbai - Ahmedabad)', 'Shatabdi', ['CC', 'EC'], [['BCT', null, '06:25', 0], ['ADI', '12:40', null, 0]]],
  ['12010', 'Shatabdi Express (Ahmedabad - Mumbai)', 'Shatabdi', ['CC', 'EC'], [['ADI', null, '14:30', 0], ['BCT', '20:45', null, 0]]],
  ['12627', 'Karnataka Express', 'Superfast', ['SL', '3A', '2A', '1A'], [['SBC', null, '19:20', 0], ['BPL', '18:25', '18:35', 1], ['AGC', '04:05', '04:10', 2], ['NDLS', '06:50', null, 2]]],
  ['12628', 'Karnataka Express', 'Superfast', ['SL', '3A', '2A', '1A'], [['NDLS', null, '21:15', 0], ['AGC', '00:15', '00:17', 1], ['BPL', '09:30', '09:40', 1], ['SBC', '07:40', null, 2]]],
  ['12841', 'Coromandel Express', 'Superfast', ['SL', '3A', '2A', '1A'], [['MAS', null, '14:45', 0], ['HWH', '17:00', null, 1]]],
  ['12842', 'Coromandel Express', 'Superfast', ['SL', '3A', '2A', '1A'], [['HWH', null, '14:50', 0], ['MAS', '17:15', null, 1]]],
  ['10103', 'Mandovi Express', 'Mail/Express', ['SL', '3A', '2A', 'CC'], [['CSMT', null, '07:10', 0], ['MAO', '19:30', null, 0]]],
  ['10104', 'Mandovi Express', 'Mail/Express', ['SL', '3A', '2A', 'CC'], [['MAO', null, '07:10', 0], ['CSMT', '19:45', null, 0]]],
  ['12123', 'Deccan Queen', 'Superfast', ['CC'], [['CSMT', null, '17:10', 0], ['PUNE', '20:25', null, 0]]],
  ['12124', 'Deccan Queen', 'Superfast', ['CC'], [['PUNE', null, '07:15', 0], ['CSMT', '10:25', null, 0]]],
  ['12015', 'Ajmer Shatabdi Express', 'Shatabdi', ['CC', 'EC'], [['NDLS', null, '06:05', 0], ['JP', '10:35', null, 0]]],
  ['12016', 'Ajmer Shatabdi Express', 'Shatabdi', ['CC', 'EC'], [['JP', null, '17:15', 0], ['NDLS', '22:20', null, 0]]],
  ['12004', 'Lucknow Swarna Shatabdi Express', 'Shatabdi', ['CC', 'EC'], [['NDLS', null, '06:10', 0], ['LKO', '12:40', null, 0]]],
  ['12003', 'Lucknow Swarna Shatabdi Express', 'Shatabdi', ['CC', 'EC'], [['LKO', null, '14:30', 0], ['NDLS', '21:10', null, 0]]],
  ['12029', 'Amritsar Swarna Shatabdi Express', 'Shatabdi', ['CC', 'EC'], [['NDLS', null, '07:20', 0], ['ASR', '13:55', null, 0]]],
  ['12030', 'Amritsar Swarna Shatabdi Express', 'Shatabdi', ['CC', 'EC'], [['ASR', null, '17:20', 0], ['NDLS', '23:35', null, 0]]],
  ['12916', 'Ashram Express', 'Superfast', ['SL', '3A', '2A', '1A'], [['ADI', null, '17:45', 0], ['JP', '04:10', '04:15', 1], ['NDLS', '08:45', null, 1]]],
  ['12915', 'Ashram Express', 'Superfast', ['SL', '3A', '2A', '1A'], [['NDLS', null, '15:20', 0], ['JP', '22:05', '22:10', 0], ['ADI', '07:30', null, 1]]],
  ['12723', 'Telangana Express', 'Superfast', ['SL', '3A', '2A', '1A'], [['SC', null, '06:25', 0], ['BPL', '23:20', '23:30', 0], ['AGC', '05:40', '05:45', 1], ['NDLS', '08:45', null, 1]]],
  ['12724', 'Telangana Express', 'Superfast', ['SL', '3A', '2A', '1A'], [['NDLS', null, '15:50', 0], ['AGC', '20:10', '20:15', 0], ['BPL', '01:50', '01:55', 1], ['SC', '17:50', null, 1]]],
  ['12007', 'Shatabdi Express (Chennai - Bengaluru)', 'Shatabdi', ['CC', 'EC'], [['MAS', null, '06:00', 0], ['SBC', '10:30', null, 0]]],
  ['12008', 'Shatabdi Express (Bengaluru - Chennai)', 'Shatabdi', ['CC', 'EC'], [['SBC', null, '16:25', 0], ['MAS', '21:05', null, 0]]],
  ['11301', 'Udyan Express', 'Mail/Express', ['SL', '3A', '2A', '1A'], [['CSMT', null, '08:05', 0], ['SBC', '05:10', null, 1]]],
  ['11302', 'Udyan Express', 'Mail/Express', ['SL', '3A', '2A', '1A'], [['SBC', null, '07:45', 0], ['CSMT', '06:00', null, 1]]],
  // Bengaluru <-> Londa <-> Goa corridor
  ['16589', 'Rani Chennamma Express', 'Superfast', ['SL', '3A', '2A', '1A'], [['SBC', null, '23:00', 0], ['LD', '07:58', '08:00', 1], ['SLI', '13:05', null, 1]]],
  ['17309', 'Yesvantpur - Vasco da Gama Express', 'Mail/Express', ['SL', '3A', '2A'], [['YPR', null, '15:00', 0], ['LD', '23:43', '23:45', 0], ['MAO', '03:25', '03:30', 1], ['VSG', '05:15', null, 1]]],
  ['17310', 'Vasco da Gama - Yesvantpur Express', 'Mail/Express', ['SL', '3A', '2A'], [['VSG', null, '22:55', 0], ['MAO', '23:30', '23:35', 0], ['LD', '02:24', '02:26', 1], ['YPR', '12:35', null, 1]]],
  // Chennai - Katpadi (Vellore) - Bengaluru - Mysuru Vande Bharat (no Wednesday service)
  ['20607', 'Vande Bharat Express (Chennai - Mysuru)', 'Vande Bharat', ['CC', 'EC'], [['MAS', null, '05:50', 0], ['KPD', '07:13', '07:15', 0], ['SBC', '10:00', '10:05', 0], ['MYS', '12:20', null, 0]], '124567'],
  ['20608', 'Vande Bharat Express (Mysuru - Chennai)', 'Vande Bharat', ['CC', 'EC'], [['MYS', null, '13:05', 0], ['SBC', '14:45', '14:50', 0], ['KPD', '17:33', '17:35', 0], ['MAS', '19:20', null, 0]], '124567'],
];

// Intercity taxis. fare = base_fare + per_km * road km; vehicles = ceil(travelers / capacity).
// provider, vehicle_class, example models, capacity, per_km, base_fare, booking site
const CAB_TYPES = [
  ['Savaari', 'Hatchback', 'Swift / WagonR', 4, 12, 300, 'https://www.savaari.com/'],
  ['Savaari', 'Sedan', 'Dzire / Etios', 4, 14, 300, 'https://www.savaari.com/'],
  ['Savaari', 'SUV', 'Ertiga / Innova', 6, 19, 400, 'https://www.savaari.com/'],
  ['Savaari', 'Tempo Traveller', 'Force Traveller (12-seater)', 12, 26, 600, 'https://www.savaari.com/'],
  ['Uber Intercity', 'Sedan', 'Dzire / Etios', 4, 15, 250, 'https://www.uber.com/in/en/ride/uber-intercity/'],
  ['Uber Intercity', 'SUV', 'Ertiga / Innova', 6, 20, 350, 'https://www.uber.com/in/en/ride/uber-intercity/'],
];

// Real properties per city: name, chain, area, stars, [price multiplier], [extra amenity codes]
const HOTELS = {
  Delhi: [
    ['The Imperial', 'The Imperial', 'Janpath', 5, 1.5, ['spa', 'pool', 'bar']],
    ['ITC Maurya', 'ITC Hotels', 'Chanakyapuri', 5, 1.3, ['spa', 'pool', 'bar']],
    ['The Leela Palace New Delhi', 'The Leela', 'Chanakyapuri', 5, 1.4, ['spa', 'pool', 'bar']],
    ['Taj Mahal, New Delhi', 'Taj', 'Man Singh Road', 5, 1.3, ['spa', 'pool', 'bar']],
    ['Lemon Tree Premier, Delhi Airport', 'Lemon Tree', 'Aerocity', 4, 1, ['pool', 'bar', 'airport_shuttle']],
    ['Ibis New Delhi Aerocity', 'Ibis', 'Aerocity', 3, 1.2, ['airport_shuttle']],
  ],
  Mumbai: [
    ['The Taj Mahal Palace', 'Taj', 'Colaba', 5, 1.7, ['spa', 'pool', 'bar']],
    ['The Oberoi Mumbai', 'The Oberoi', 'Nariman Point', 5, 1.4, ['spa', 'pool', 'bar']],
    ['Trident Nariman Point', 'Trident', 'Nariman Point', 5, 1, ['pool', 'bar', 'spa']],
    ['JW Marriott Mumbai Juhu', 'Marriott', 'Juhu', 5, 1.1, ['pool', 'spa', 'bar', 'beach']],
    ['Sofitel Mumbai BKC', 'Sofitel', 'Bandra Kurla Complex', 5, 1, ['pool', 'spa', 'bar']],
    ['Lemon Tree Premier, Mumbai Airport', 'Lemon Tree', 'Andheri East', 4, 1, ['pool', 'airport_shuttle']],
    ['The Residency Hotel Fort', 'The Residency', 'Fort', 3, 1, []],
    ['Hotel Suba Palace', 'Suba', 'Colaba', 3, 1, []],
  ],
  Bengaluru: [
    ['The Leela Palace Bengaluru', 'The Leela', 'Old Airport Road', 5, 1.3, ['spa', 'pool', 'bar']],
    ['Taj West End', 'Taj', 'Race Course Road', 5, 1.3, ['spa', 'pool', 'bar']],
    ['ITC Gardenia', 'ITC Hotels', 'Residency Road', 5, 1.1, ['spa', 'pool', 'bar']],
    ['The Oberoi Bengaluru', 'The Oberoi', 'MG Road', 5, 1.3, ['spa', 'pool', 'bar']],
    ['Lemon Tree Premier, Ulsoor Lake', 'Lemon Tree', 'Ulsoor', 4, 1, ['pool', 'bar']],
    ['Ibis Bengaluru City Centre', 'Ibis', 'Race Course Road', 3, 1, []],
  ],
  Chennai: [
    ['ITC Grand Chola', 'ITC Hotels', 'Guindy', 5, 1.3, ['spa', 'pool', 'bar']],
    ['Taj Coromandel', 'Taj', 'Nungambakkam', 5, 1.1, ['spa', 'pool', 'bar']],
    ['The Leela Palace Chennai', 'The Leela', 'Adyar', 5, 1.2, ['spa', 'pool', 'bar', 'beach']],
    ['Hyatt Regency Chennai', 'Hyatt', 'Teynampet', 5, 0.9, ['pool', 'spa', 'bar']],
    ['The Park Chennai', 'The Park', 'Nungambakkam', 5, 0.8, ['pool', 'bar']],
    ['Radisson Blu City Centre', 'Radisson', 'Alwarpet', 4, 0.9, ['pool']],
  ],
  Kolkata: [
    ['The Oberoi Grand', 'The Oberoi', 'Chowringhee', 5, 1.2, ['spa', 'pool', 'bar']],
    ['Taj Bengal', 'Taj', 'Alipore', 5, 1.1, ['spa', 'pool', 'bar']],
    ['ITC Royal Bengal', 'ITC Hotels', 'EM Bypass', 5, 1.1, ['spa', 'pool', 'bar']],
    ['Hyatt Regency Kolkata', 'Hyatt', 'Salt Lake', 5, 0.9, ['pool', 'spa', 'bar']],
    ['The Park Kolkata', 'The Park', 'Park Street', 4, 0.9, ['pool', 'bar']],
    ['Hotel Hindusthan International', 'Hindusthan', 'Park Street', 3, 0.9, []],
  ],
  Hyderabad: [
    ['Taj Falaknuma Palace', 'Taj', 'Engine Bowli', 5, 2.4, ['spa', 'pool', 'bar']],
    ['Taj Krishna', 'Taj', 'Banjara Hills', 5, 1, ['spa', 'pool', 'bar']],
    ['ITC Kakatiya', 'ITC Hotels', 'Begumpet', 5, 1, ['spa', 'pool', 'bar']],
    ['Park Hyatt Hyderabad', 'Hyatt', 'Banjara Hills', 5, 1, ['spa', 'pool', 'bar']],
    ['Novotel Hyderabad Convention Centre', 'Novotel', 'HITEC City', 4, 1, ['pool', 'bar']],
    ['Lemon Tree Hotel, HITEC City', 'Lemon Tree', 'HITEC City', 4, 0.8, ['pool']],
  ],
  Goa: [
    ['Taj Fort Aguada Resort & Spa', 'Taj', 'Sinquerim', 5, 1.4, ['spa', 'pool', 'bar', 'beach']],
    ['Grand Hyatt Goa', 'Hyatt', 'Bambolim', 5, 1.1, ['spa', 'pool', 'bar', 'beach']],
    ['W Goa', 'W Hotels', 'Vagator', 5, 1.5, ['spa', 'pool', 'bar', 'beach']],
    ['The Leela Goa', 'The Leela', 'Cavelossim', 5, 1.2, ['spa', 'pool', 'bar', 'beach']],
    ['Alila Diwa Goa', 'Alila', 'Majorda', 5, 0.9, ['spa', 'pool', 'bar']],
    ['Resort Rio', 'Resort Rio', 'Arpora', 4, 0.8, ['pool', 'bar']],
    ['Zostel Goa', 'Zostel', 'Anjuna', 1, 1, ['beach']],
  ],
  Ahmedabad: [
    ['Hyatt Regency Ahmedabad', 'Hyatt', 'Ashram Road', 5, 0.9, ['pool', 'spa', 'bar']],
    ['The House of MG', 'Heritage', 'Lal Darwaja', 4, 1.1, ['pool']],
    ['Courtyard by Marriott Ahmedabad', 'Marriott', 'SG Highway', 4, 0.9, ['pool', 'bar']],
    ['Fortune Landmark', 'Fortune', 'Usmanpura', 4, 0.8, ['pool']],
  ],
  Pune: [
    ['JW Marriott Hotel Pune', 'Marriott', 'Senapati Bapat Road', 5, 1, ['pool', 'spa', 'bar']],
    ['Conrad Pune', 'Hilton', 'Mangaldas Road', 5, 1, ['pool', 'spa', 'bar']],
    ['The Westin Pune Koregaon Park', 'Westin', 'Koregaon Park', 5, 1, ['pool', 'spa', 'bar']],
    ['Novotel Pune Nagar Road', 'Novotel', 'Nagar Road', 4, 0.9, ['pool', 'airport_shuttle']],
    ['Lemon Tree Hotel, Hinjewadi', 'Lemon Tree', 'Hinjewadi', 4, 0.8, ['pool']],
  ],
  Jaipur: [
    ['Rambagh Palace', 'Taj', 'Bhawani Singh Road', 5, 2.5, ['spa', 'pool', 'bar']],
    ['Taj Jai Mahal Palace', 'Taj', 'Jacob Road', 5, 1.3, ['spa', 'pool', 'bar']],
    ['Fairmont Jaipur', 'Fairmont', 'Kukas', 5, 1.2, ['spa', 'pool', 'bar']],
    ['ITC Rajputana', 'ITC Hotels', 'Palace Road', 5, 1, ['spa', 'pool', 'bar']],
    ['Hotel Clarks Amer', 'Clarks', 'JLN Marg', 4, 0.9, ['pool', 'bar']],
    ['Alsisar Haveli', 'Heritage', 'Sansar Chandra Road', 3, 1.2, ['pool']],
    ['Zostel Jaipur', 'Zostel', 'Bani Park', 1, 1, []],
  ],
  Varanasi: [
    ['Taj Ganges', 'Taj', 'Nadesar', 5, 0.9, ['spa', 'pool', 'bar']],
    ['BrijRama Palace', 'Heritage', 'Darbhanga Ghat', 5, 1.3, ['ghat_view', 'spa']],
    ['Radisson Hotel Varanasi', 'Radisson', 'The Mall', 4, 0.8, ['pool', 'bar']],
    ['Hotel Ganges View', 'Ganges View', 'Assi Ghat', 3, 1, ['ghat_view']],
    ['Zostel Varanasi', 'Zostel', 'Dashashwamedh', 1, 1, []],
  ],
  Kochi: [
    ['Taj Malabar Resort & Spa', 'Taj', 'Willingdon Island', 5, 1, ['spa', 'pool', 'bar', 'lake_view']],
    ['Grand Hyatt Kochi Bolgatty', 'Hyatt', 'Bolgatty Island', 5, 0.9, ['spa', 'pool', 'bar', 'lake_view']],
    ['Le Meridien Kochi', 'Marriott', 'Maradu', 5, 0.8, ['pool', 'spa', 'bar']],
    ['Brunton Boatyard', 'CGH Earth', 'Fort Kochi', 5, 1.2, ['pool', 'bar', 'lake_view']],
    ['Hotel Abad Plaza', 'Abad', 'MG Road', 4, 0.7, ['pool']],
    ['Zostel Fort Kochi', 'Zostel', 'Fort Kochi', 1, 1, []],
  ],
  Lucknow: [
    ['Taj Mahal Lucknow', 'Taj', 'Gomti Nagar', 5, 0.9, ['spa', 'pool', 'bar']],
    ['Clarks Awadh', 'Clarks', 'MG Marg', 4, 0.8, ['pool', 'bar']],
    ['Lemon Tree Premier, Lucknow', 'Lemon Tree', 'Gomti Nagar', 4, 0.7, ['pool']],
    ['Fairfield by Marriott Lucknow', 'Marriott', 'Gomti Nagar', 4, 0.8, ['pool']],
  ],
  Amritsar: [
    ['Taj Swarna', 'Taj', 'Ranjit Avenue', 5, 0.8, ['spa', 'pool', 'bar']],
    ['Hyatt Regency Amritsar', 'Hyatt', 'Ranjit Avenue', 5, 0.8, ['spa', 'pool']],
    ['Ramada by Wyndham Amritsar', 'Ramada', 'Mall Road', 4, 0.7, ['pool']],
    ['Zostel Amritsar', 'Zostel', 'Golden Temple Road', 1, 1, []],
  ],
  Udaipur: [
    ['Taj Lake Palace', 'Taj', 'Lake Pichola', 5, 3, ['spa', 'pool', 'bar', 'lake_view']],
    ['The Oberoi Udaivilas', 'The Oberoi', 'Haridasji Ki Magri', 5, 2.6, ['spa', 'pool', 'bar', 'lake_view']],
    ['The Leela Palace Udaipur', 'The Leela', 'Lake Pichola', 5, 1.9, ['spa', 'pool', 'bar', 'lake_view']],
    ['Hotel Lake Pichola', 'Heritage', 'Lake Pichola', 3, 1.2, ['lake_view']],
    ['Zostel Udaipur', 'Zostel', 'Chandpole', 1, 1, []],
  ],
  Srinagar: [
    ['The Lalit Grand Palace Srinagar', 'The Lalit', 'Gupkar Road', 5, 1.2, ['spa', 'bar', 'lake_view']],
    ['Vivanta Dal View', 'Taj', 'Brein', 5, 1.1, ['spa', 'pool', 'lake_view']],
    ['Hotel Heevan', 'Heevan', 'Rajbagh', 3, 0.9, ['lake_view']],
  ],
  Bhopal: [
    ['Jehan Numa Palace', 'Heritage', 'Shamla Hills', 5, 0.8, ['spa', 'pool', 'bar', 'lake_view']],
    ['Noor-Us-Sabah Palace', 'Heritage', 'Kohefiza', 4, 0.8, ['pool', 'lake_view']],
    ['Courtyard by Marriott Bhopal', 'Marriott', 'Arera Hills', 4, 0.7, ['pool', 'bar']],
  ],
  Agra: [
    ['Oberoi Amarvilas', 'The Oberoi', 'Taj East Gate Road', 5, 2.3, ['spa', 'pool', 'bar', 'taj_view']],
    ['ITC Mughal', 'ITC Hotels', 'Taj Ganj', 5, 0.9, ['spa', 'pool', 'bar']],
    ['Taj Hotel & Convention Centre', 'Taj', 'Fatehabad Road', 5, 0.8, ['pool', 'spa', 'bar']],
    ['Radisson Hotel Agra', 'Radisson', 'Taj East Gate Road', 4, 0.7, ['pool']],
    ['Zostel Agra', 'Zostel', 'Taj Ganj', 1, 1, ['taj_view']],
  ],
};

// Every city also gets two generic budget-chain listings.
const BUDGET_CHAINS = [
  ['Treebo Trend', 'Treebo', 'Central', 3, 1, []],
  ['OYO Townhouse', 'OYO', 'Near Station', 2, 1, []],
];

const AMENITIES = [
  ['wifi', 'Free Wi-Fi'],
  ['ac', 'Air conditioning'],
  ['breakfast', 'Breakfast included'],
  ['restaurant', 'On-site restaurant'],
  ['parking', 'Free parking'],
  ['gym', 'Fitness centre'],
  ['pool', 'Swimming pool'],
  ['spa', 'Spa'],
  ['bar', 'Bar / lounge'],
  ['airport_shuttle', 'Airport shuttle'],
  ['pet_friendly', 'Pet friendly'],
  ['beach', 'Beach access'],
  ['lake_view', 'Lake view'],
  ['ghat_view', 'Ghat view'],
  ['taj_view', 'Taj Mahal view'],
];

const CITY_PRICE_FACTOR = {
  Mumbai: 1.25, Delhi: 1.15, Goa: 1.2, Udaipur: 1.1, Bengaluru: 1.0, Hyderabad: 0.95, Chennai: 0.9,
};

module.exports = {
  CITIES, AIRPORTS, STATIONS, AIRLINES, HUB_AIRPORTS, TRUNK_AIRPORTS, FARE_RATES, TRAINS, HOTELS,
  BUDGET_CHAINS, AMENITIES, CITY_PRICE_FACTOR, TRAIN_BOOKING_URL, CHAIN_URLS, CAB_TYPES,
};
