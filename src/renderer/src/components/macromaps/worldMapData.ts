/**
 * PIA Terminal - Macro Maps World Vector Geometry
 * Optimized country paths and coordinate boundaries for high-performance interactive choropleth map.
 */

export interface CountryPath {
  id: string // ISO 3166-1 alpha-2 code
  name: string
  path: string
  center: [number, number] // [x, y] for label/tooltip anchor
}

// Coordinate space: 1000 x 500 (standard equirectangular/Miller projection)
export const WORLD_MAP_VIEWBOX = '0 0 1000 500'

export const WORLD_COUNTRIES: CountryPath[] = [
  // NORTH AMERICA
  {
    id: 'US',
    name: 'United States',
    center: [230, 175],
    path: 'M 140,110 L 220,110 L 290,115 L 305,150 L 300,195 L 290,225 L 250,225 L 235,215 L 210,230 L 175,200 L 150,195 L 140,140 Z M 70,70 L 120,65 L 130,95 L 90,115 L 65,95 Z'
  },
  {
    id: 'CA',
    name: 'Canada',
    center: [220, 80],
    path: 'M 125,65 L 220,60 L 285,65 L 310,95 L 290,115 L 220,110 L 140,110 L 125,85 Z M 270,30 L 315,35 L 300,65 L 265,55 Z'
  },
  {
    id: 'MX',
    name: 'Mexico',
    center: [195, 230],
    path: 'M 150,195 L 175,200 L 210,230 L 235,215 L 230,240 L 210,260 L 180,245 L 160,220 Z'
  },

  // SOUTH AMERICA
  {
    id: 'BR',
    name: 'Brazil',
    center: [360, 310],
    path: 'M 315,260 L 350,255 L 385,270 L 400,295 L 390,340 L 355,360 L 330,340 L 310,300 Z'
  },
  {
    id: 'AR',
    name: 'Argentina',
    center: [330, 395],
    path: 'M 320,335 L 345,340 L 340,380 L 335,430 L 320,440 L 315,390 L 315,350 Z'
  },
  {
    id: 'CL',
    name: 'Chile',
    center: [312, 390],
    path: 'M 312,335 L 320,335 L 315,390 L 320,440 L 310,435 L 308,370 Z'
  },
  {
    id: 'CO',
    name: 'Colombia',
    center: [285, 260],
    path: 'M 270,240 L 300,245 L 305,270 L 285,285 L 275,265 Z'
  },
  {
    id: 'PE',
    name: 'Peru',
    center: [290, 305],
    path: 'M 275,265 L 305,270 L 315,300 L 305,335 L 285,310 Z'
  },

  // EUROPE
  {
    id: 'GB',
    name: 'United Kingdom',
    center: [480, 130],
    path: 'M 470,115 L 485,115 L 490,140 L 475,145 L 468,130 Z M 460,125 L 468,125 L 465,135 L 458,135 Z'
  },
  {
    id: 'DE',
    name: 'Germany',
    center: [520, 140],
    path: 'M 510,125 L 530,125 L 535,145 L 525,155 L 512,150 L 510,135 Z'
  },
  {
    id: 'FR',
    name: 'France',
    center: [495, 155],
    path: 'M 485,145 L 505,145 L 512,150 L 510,175 L 485,175 L 480,155 Z'
  },
  {
    id: 'IT',
    name: 'Italy',
    center: [530, 175],
    path: 'M 520,160 L 535,160 L 545,180 L 540,195 L 530,190 L 525,175 Z'
  },
  {
    id: 'ES',
    name: 'Spain',
    center: [475, 180],
    path: 'M 465,165 L 490,165 L 485,190 L 460,190 L 455,175 Z'
  },
  {
    id: 'NL',
    name: 'Netherlands',
    center: [505, 133],
    path: 'M 502,128 L 512,128 L 512,136 L 502,136 Z'
  },
  {
    id: 'CH',
    name: 'Switzerland',
    center: [513, 157],
    path: 'M 510,154 L 520,154 L 520,160 L 510,160 Z'
  },
  {
    id: 'PL',
    name: 'Poland',
    center: [550, 135],
    path: 'M 535,125 L 565,125 L 565,145 L 535,145 Z'
  },
  {
    id: 'SE',
    name: 'Sweden',
    center: [535, 95],
    path: 'M 525,75 L 545,75 L 545,120 L 530,120 Z'
  },
  {
    id: 'NO',
    name: 'Norway',
    center: [515, 90],
    path: 'M 510,70 L 525,75 L 530,115 L 515,115 L 505,95 Z'
  },
  {
    id: 'RU',
    name: 'Russia',
    center: [680, 105],
    path: 'M 570,90 L 700,70 L 850,75 L 890,95 L 870,135 L 750,145 L 650,140 L 575,120 Z'
  },
  {
    id: 'TR',
    name: 'Turkey',
    center: [590, 185],
    path: 'M 570,175 L 615,175 L 610,195 L 570,195 Z'
  },

  // MIDDLE EAST & AFRICA
  {
    id: 'SA',
    name: 'Saudi Arabia',
    center: [610, 230],
    path: 'M 590,205 L 635,210 L 640,245 L 615,255 L 595,245 Z'
  },
  {
    id: 'AE',
    name: 'United Arab Emirates',
    center: [640, 232],
    path: 'M 635,225 L 648,225 L 648,236 L 635,236 Z'
  },
  {
    id: 'EG',
    name: 'Egypt',
    center: [565, 215],
    path: 'M 550,200 L 580,200 L 580,230 L 550,230 Z'
  },
  {
    id: 'ZA',
    name: 'South Africa',
    center: [555, 390],
    path: 'M 535,365 L 575,365 L 575,410 L 545,415 L 535,395 Z'
  },
  {
    id: 'NG',
    name: 'Nigeria',
    center: [515, 270],
    path: 'M 500,255 L 530,255 L 530,285 L 500,285 Z'
  },

  // ASIA & OCEANIA
  {
    id: 'CN',
    name: 'China',
    center: [750, 195],
    path: 'M 680,150 L 760,150 L 810,180 L 800,235 L 750,245 L 700,230 L 680,185 Z'
  },
  {
    id: 'JP',
    name: 'Japan',
    center: [860, 185],
    path: 'M 850,165 L 865,165 L 870,195 L 850,210 L 845,190 Z'
  },
  {
    id: 'KR',
    name: 'South Korea',
    center: [825, 188],
    path: 'M 818,178 L 832,178 L 832,198 L 818,198 Z'
  },
  {
    id: 'IN',
    name: 'India',
    center: [695, 235],
    path: 'M 670,195 L 720,200 L 725,235 L 705,275 L 685,260 L 670,225 Z'
  },
  {
    id: 'ID',
    name: 'Indonesia',
    center: [780, 310],
    path: 'M 740,295 L 775,295 L 785,310 L 750,310 Z M 770,285 L 800,285 L 805,300 L 775,300 Z M 810,290 L 845,290 L 845,305 L 810,305 Z M 775,312 L 815,312 L 815,320 L 775,320 Z'
  },
  {
    id: 'AU',
    name: 'Australia',
    center: [825, 380],
    path: 'M 780,340 L 845,335 L 880,370 L 865,420 L 805,420 L 775,385 Z M 845,430 L 860,430 L 860,445 L 845,445 Z'
  },
  {
    id: 'NZ',
    name: 'New Zealand',
    center: [910, 425],
    path: 'M 900,410 L 915,410 L 920,435 L 905,445 Z'
  },
  {
    id: 'SG',
    name: 'Singapore',
    center: [752, 290],
    path: 'M 749,287 L 755,287 L 755,293 L 749,293 Z'
  },
  {
    id: 'VN',
    name: 'Vietnam',
    center: [760, 245],
    path: 'M 750,225 L 765,225 L 765,265 L 752,260 Z'
  },
  {
    id: 'TH',
    name: 'Thailand',
    center: [742, 245],
    path: 'M 735,225 L 750,225 L 748,260 L 735,255 Z'
  },
  {
    id: 'MY',
    name: 'Malaysia',
    center: [755, 280],
    path: 'M 740,275 L 760,275 L 760,288 L 740,288 Z M 775,275 L 805,275 L 805,285 L 775,285 Z'
  },
  {
    id: 'PH',
    name: 'Philippines',
    center: [805, 255],
    path: 'M 798,235 L 812,235 L 812,275 L 798,270 Z'
  }
]
