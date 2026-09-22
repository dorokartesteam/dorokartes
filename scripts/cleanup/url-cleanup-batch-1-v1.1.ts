import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const TRACKING_FIXES = [
  {
    "giftCardId": "cmta4yjz8001hsciydalghjrj",
    "merchant": "Δωροκάρτα από την Harpy Clothing 2026",
    "title": "Δωροκάρτα από την Harpy Clothing 2026",
    "expectedUrl": "https://www.harpy.gr/product/gift-card-by-harpy-clothing/?srsltid=AfmBOoqKglMRpVOaAMYiXy_vbk1xc6D8v8XkOgteCiWFiJwL2yttvJmR",
    "newUrl": "https://www.harpy.gr/product/gift-card-by-harpy-clothing/"
  },
  {
    "giftCardId": "cmta5nma4000b54iy51dzh8t6",
    "merchant": "Baby Gear",
    "title": "Gift Cards - Baby Gear",
    "expectedUrl": "https://www.babygear.gr/gift_cards?srsltid=AfmBOorNC4uPo2iFhBQwi7mytj8V4WPohBZvdmlD-6LGAFTKZIFmHjoO",
    "newUrl": "https://www.babygear.gr/gift_cards"
  },
  {
    "giftCardId": "cmta4y9db000bsciyg566bd57",
    "merchant": "Barbopoulos",
    "title": "Gift card - Barbopoulos store, Chania",
    "expectedUrl": "https://www.barbopoulos.gr/product/gift-card-barbopoulos/?srsltid=AfmBOorAqLtZNbTUv_YfKZX5JtDaTXCaoc6q5YwvyP7gLznz8dBJzqnc",
    "newUrl": "https://www.barbopoulos.gr/product/gift-card-barbopoulos/"
  },
  {
    "giftCardId": "cmta4yafm000fsciycmpn7qlk",
    "merchant": "Best Wines",
    "title": "Best Wines Gift Card",
    "expectedUrl": "https://bestwines.gr/product-category/giftcard/?srsltid=AfmBOorPTKZRWNhABKCQUXSrPxAv9W43KmTtSrizZ1TS_otC3EEjsNbL",
    "newUrl": "https://bestwines.gr/product-category/giftcard/"
  },
  {
    "giftCardId": "cmta4ycwk000psciyut3q4w1n",
    "merchant": "Christhellas",
    "title": "Christhellas Gift Card",
    "expectedUrl": "https://christhellas.gr/product/christhellas-gift-card/?srsltid=AfmBOoq8_KSmhzAMtEMaCOiMRVmIGGmfPtRustVVUh8u2WwdVF_g-FwY",
    "newUrl": "https://christhellas.gr/product/christhellas-gift-card/"
  },
  {
    "giftCardId": "cmta4ydcy000rsciyxn344u55",
    "merchant": "Christines",
    "title": "Christine's Gift Card - Christine Lingerie",
    "expectedUrl": "https://www.christines.gr/products/christine-gift-card?srsltid=AfmBOoojYLUV5Wezqy14MZNwO77BH9zvgJPyKELs4gFcRxaUGMVDprj6",
    "newUrl": "https://www.christines.gr/products/christine-gift-card"
  },
  {
    "giftCardId": "cmta4yfvk0011sciyi5zwgnhr",
    "merchant": "Evilio Home",
    "title": "Evilio Home Gift Card",
    "expectedUrl": "https://eviliohome.gr/products/giftcard-evilio-home?srsltid=AfmBOoqB2Q-o7MU5Fwy8lw78XHBOyQ2WrcnqwiCxCzPHMAErwjg52GTS",
    "newUrl": "https://eviliohome.gr/products/giftcard-evilio-home"
  },
  {
    "giftCardId": "cmta4ygt70015sciy7ka9te7j",
    "merchant": "Fairytale",
    "title": "Fairytale Gift Card",
    "expectedUrl": "https://fairytale.com.gr/en/product/fairytale-gift-card/?srsltid=AfmBOor8Ibifq_G5Z787tkZNY5Tl6yhx9lujOGDrW4OnG-Azk2KUCE52",
    "newUrl": "https://fairytale.com.gr/en/product/fairytale-gift-card/"
  },
  {
    "giftCardId": "cmtb62iiy000j94iy06vaeu26",
    "merchant": "Frati",
    "title": "Frati Gift Card",
    "expectedUrl": "https://www.frati.gr/shop/dora-gift-cards/gift-cards/?srsltid",
    "newUrl": "https://www.frati.gr/shop/dora-gift-cards/gift-cards/"
  },
  {
    "giftCardId": "cmta4yi6v001bsciyp7vwf5ct",
    "merchant": "Gasmoto",
    "title": "e-Gift Card ΑΠΟ GAS Motosport Culture",
    "expectedUrl": "https://www.gasmoto.gr/en/e-gift-card-from-gas-motosport-culture?srsltid=AfmBOop_daiyY4vi9TYPALI6LZR9FiExjo8Wr65h9YxWssjno8ylHpc5",
    "newUrl": "https://www.gasmoto.gr/en/e-gift-card-from-gas-motosport-culture"
  },
  {
    "giftCardId": "cmtb62k3c000r94iytlubd8tx",
    "merchant": "Gofishome",
    "title": "Gofishome Gift Card",
    "expectedUrl": "https://gofishome.gr/en/products/gift-card?srsltid",
    "newUrl": "https://gofishome.gr/en/products/gift-card"
  },
  {
    "giftCardId": "cmta5nouj000p54iya63lmod4",
    "merchant": "Golden A Exclusive Boutique",
    "title": "Δωροκάρτα - Golden A Exclusive Boutique",
    "expectedUrl": "https://www.golden-a.gr/product/gift-card/?srsltid=AfmBOoqgT9odasGffG4KelhuF1y5HhOhj1m1KNLOmOF9Kk0BqhVlj5Er",
    "newUrl": "https://www.golden-a.gr/product/gift-card/"
  },
  {
    "giftCardId": "cmta4yj4g001fsciy0ipo9fb8",
    "merchant": "Green Leaf",
    "title": "Greenleaf Gift Card",
    "expectedUrl": "https://green-leaf.gr/en-eu/products/greenleaf-gift-card?srsltid=AfmBOopwgHXrlsvd6QmsnsoLNjyN_0hfM28o8pJTONTgWrAmw-tmRwp4",
    "newUrl": "https://green-leaf.gr/en-eu/products/greenleaf-gift-card"
  },
  {
    "giftCardId": "cmta4ykff001jsciy0c44rmjw",
    "merchant": "Hebekidshome",
    "title": "e-Gift Card Hebe Kids Home - Ιδανικό Δώρο για Κάθε ...",
    "expectedUrl": "https://hebekidshome.gr/products/e-gift-cards?srsltid=AfmBOoq-qOyKzCFGOgaCanQGsr-cgS8jhXBU-P0TRbTnLIVohtxhQlqP",
    "newUrl": "https://hebekidshome.gr/products/e-gift-cards"
  },
  {
    "giftCardId": "cmta5npkk000t54iyjgkmw0i1",
    "merchant": "Kalina Concept Store",
    "title": "Kalina Concept Store - GIFT CARD",
    "expectedUrl": "https://kalinaconceptstore.gr/products/gift-card-kalina-concept-store?srsltid=AfmBOorgzWkZpfBaPYqqARKb9wop02LbcC_yk1o_0sVP6K0hJOkAJntx",
    "newUrl": "https://kalinaconceptstore.gr/products/gift-card-kalina-concept-store"
  },
  {
    "giftCardId": "cmtb62lvm001194iyq5zn5axw",
    "merchant": "Kids Garden",
    "title": "Gift Card - Kids Garden",
    "expectedUrl": "https://www.kidsgarden.gr/en/product/gift-card-en/?srsltid=AfmBOooSfynbL7v300RE025ECEyB-qTuEwnqETUiXC2RdMpEkcbTGQpl",
    "newUrl": "https://www.kidsgarden.gr/en/product/gift-card-en/"
  },
  {
    "giftCardId": "cmta4ynq0001xsciy5l1rugwg",
    "merchant": "Kidsloveplanet",
    "title": "Gift Card - Kids Love Planet",
    "expectedUrl": "https://www.kidsloveplanet.gr/product-category/mwb_wgm_giftcard/?srsltid=AfmBOoos7jMAgsPvs9l4tW5mTBHTQK06PqlvfI8DC5U3xzGNJuJ96DwZ",
    "newUrl": "https://www.kidsloveplanet.gr/product-category/mwb_wgm_giftcard/"
  },
  {
    "giftCardId": "cmta4yo8c001zsciybdwdoiop",
    "merchant": "Kitabu",
    "title": "Kitabu Gift Card",
    "expectedUrl": "https://www.kitabu.gr/products/kitabu-gift-card?srsltid=AfmBOorrz3N7CcJMMxR9xh9oZzOspDdv5jCksRqAJgiWY45LSV2rtysv",
    "newUrl": "https://www.kitabu.gr/products/kitabu-gift-card"
  },
  {
    "giftCardId": "cmta4yop20021sciygr9rpkdk",
    "merchant": "Kolbo",
    "title": "KOLBO Gift Card",
    "expectedUrl": "https://kolbo.gr/en/products/kolbo-gift-card?srsltid=AfmBOorljYiSDILmbTbv5IYqJVTJ3BIQWqJMmP5o2yfij2eBr_vRbwZL",
    "newUrl": "https://kolbo.gr/en/products/kolbo-gift-card"
  },
  {
    "giftCardId": "cmta4ypmb0025sciygzh9a89h",
    "merchant": "Kounelis",
    "title": "e-GIFT CARD",
    "expectedUrl": "https://kounelis.com.gr/gift-card?srsltid=AfmBOopGy1Q0alXGRKRaPZ7Zw67Cu0xX91DBXnXsxrlHO5Inz0OYZUu1",
    "newUrl": "https://kounelis.com.gr/gift-card"
  },
  {
    "giftCardId": "cmta4yrha002dsciywsr7shx4",
    "merchant": "Leather Studio",
    "title": "Leather Studio Gift Card",
    "expectedUrl": "https://www.leatherstudio.gr/el/products/copy-of-gift-card?srsltid=AfmBOoqpDrXIE_fA_yZRQ9z47-bZ1Ul0ITgf_sEZLCsb4M3B6YO5K3Xg",
    "newUrl": "https://www.leatherstudio.gr/el/products/copy-of-gift-card"
  },
  {
    "giftCardId": "cmta5nrd7001354iyo6sumjdq",
    "merchant": "Londonboutique",
    "title": "London Boutique Gift card - London Βoutique",
    "expectedUrl": "https://www.londonboutique.gr/product/london-boutique-gift-card-6/?srsltid=AfmBOoplBkxynnLo-jtk_SI0AXzE9nfxHEuDaAnHJoAWkxxbbtBm45L9",
    "newUrl": "https://www.londonboutique.gr/product/london-boutique-gift-card-6/"
  },
  {
    "giftCardId": "cmta5nrpi001554iy38lsipa9",
    "merchant": "Love It",
    "title": "Love.it Gift Card Digital",
    "expectedUrl": "https://www.love-it.gr/en/design-product/prid/8281/r/love-it-gift-card-digital?srsltid=AfmBOor7AsdQ_AFodYvX0jyxZK00l9QvefpYawTKuMYoplbS1_PTWrn1",
    "newUrl": "https://www.love-it.gr/en/design-product/prid/8281/r/love-it-gift-card-digital"
  },
  {
    "giftCardId": "cmta4yswj002jsciyi6a7q4zk",
    "merchant": "Lumiere",
    "title": "LUMIERE Gift Card",
    "expectedUrl": "https://lumiere.com.gr/products/lumiere-gift-card?srsltid=AfmBOop8LODlfos-jdJdtkpieXgQeirm6v4B52leHsJfIVrfjcXwkHlP",
    "newUrl": "https://lumiere.com.gr/products/lumiere-gift-card"
  },
  {
    "giftCardId": "cmta5ns2z001754iyqm8xijsp",
    "merchant": "Madeofglass",
    "title": "Made of Glass Gift Card",
    "expectedUrl": "https://madeofglass.gr/products/made-of-glass-gift-card-1?srsltid=AfmBOormg545Om3unDfjD1P0AqYJqz0E0cSFjiiCbFOGTbyuIkaYdZ4y",
    "newUrl": "https://madeofglass.gr/products/made-of-glass-gift-card-1"
  },
  {
    "giftCardId": "cmta5nt82001d54iysnv9gyou",
    "merchant": "Mine Perfume Lab",
    "title": "Mine Perfume Lab Gift Card",
    "expectedUrl": "https://mineperfumelab.gr/products/e-gift-card?srsltid=AfmBOopejP2ha5OXGx719OMo2OnaEnBTLWJTGgde_Toytgmb9sO-aPmR",
    "newUrl": "https://mineperfumelab.gr/products/e-gift-card"
  },
  {
    "giftCardId": "cmtb62mzp001794iymwe27b7c",
    "merchant": "Morethanthis",
    "title": "Gift Voucher",
    "expectedUrl": "https://morethanthis.gr/products/gift-voucher?srsltid",
    "newUrl": "https://morethanthis.gr/products/gift-voucher"
  },
  {
    "giftCardId": "cmta4yvpr002vsciyrkj6lfwe",
    "merchant": "Motoholics e",
    "title": "Motoholics e-Gift Card",
    "expectedUrl": "https://motoholics.gr/motoholics-e-gift-card?srsltid=AfmBOorsIfPkxr3HPdqtJF9Aa28lkqALyIDniuFjV695a_WOzsSYS5WH",
    "newUrl": "https://motoholics.gr/motoholics-e-gift-card"
  },
  {
    "giftCardId": "cmtb62ncf001994iy7kzv2o19",
    "merchant": "Motorparts",
    "title": "Gift Cards",
    "expectedUrl": "https://www.motorparts.com.gr/en/gift-cards/?srsltid",
    "newUrl": "https://www.motorparts.com.gr/en/gift-cards/"
  },
  {
    "giftCardId": "cmta4ywn6002zsciyr9vasxj3",
    "merchant": "mybeautybox",
    "title": "mybeautybox Gift Card",
    "expectedUrl": "https://www.mybeautybox.gr/vrefos-paidi/gift-card-mybeautybox-detail?srsltid=AfmBOoo5uaScKw3pUzJgrCdvlsNpfI9-BOScwbl515Mcv6H2OHGQpek3",
    "newUrl": "https://www.mybeautybox.gr/vrefos-paidi/gift-card-mybeautybox-detail"
  },
  {
    "giftCardId": "cmta5nvi5001p54iyc6wox7hx",
    "merchant": "Neraw",
    "title": "Neraw Digital Gift Card | Planted Ceramic Sculpture",
    "expectedUrl": "https://www.neraw.gr/products/neraw-digital-gift-card?srsltid=AfmBOoqIkJN-feWnAjmtcH8P3KdNYVDJW6AHsmGjvX_86VYFcRKxPBQ_",
    "newUrl": "https://www.neraw.gr/products/neraw-digital-gift-card"
  },
  {
    "giftCardId": "cmta4yyi40037sciy4r3rabo3",
    "merchant": "Niai",
    "title": "Niai Gift Card",
    "expectedUrl": "https://niai.gr/products/niai-gift-card?srsltid=AfmBOopBNVxFWbIETvSGWX_vCWgzp4xIAejqXGAmhyh_ASLWUuI58Q3K",
    "newUrl": "https://niai.gr/products/niai-gift-card"
  },
  {
    "giftCardId": "cmta4yyxo0039sciy0650z05i",
    "merchant": "Patousaki Shoes",
    "title": "Patousaki Shoes Gift Card",
    "expectedUrl": "https://www.patousakishoes.gr/product-tag/giftcard/?srsltid",
    "newUrl": "https://www.patousakishoes.gr/product-tag/giftcard/"
  },
  {
    "giftCardId": "cmta4yztg003dsciyt7jc3op8",
    "merchant": "Ricordi",
    "title": "Όροι Gift Card - RICORDI - Men's Designer Clothing",
    "expectedUrl": "https://ricordi.gr/en/oroi-gift-card/?srsltid",
    "newUrl": "https://ricordi.gr/en/oroi-gift-card/"
  },
  {
    "giftCardId": "cmta4z09e003fsciy54qp8l7j",
    "merchant": "Rideonline",
    "title": "GIFT CARD - rideonline bmx streetwear",
    "expectedUrl": "https://www.rideonline.gr/en/product/gift-card/?srsltid=AfmBOopkOYnBheo0141JHXVYX8rIsZqn8tmi6dmPyBvVGSmK6dxSixxu",
    "newUrl": "https://www.rideonline.gr/en/product/gift-card/"
  },
  {
    "giftCardId": "cmta4z237003nsciya30y9c8g",
    "merchant": "Semiology",
    "title": "Semiology Gift Cards",
    "expectedUrl": "https://semiology.gr/en/products/semiology-gift-cards?srsltid=AfmBOopQfkvIiWqGloGY59xQ7sT-URmQlZCum7eJDlRf3Wvh86dBJetc",
    "newUrl": "https://semiology.gr/en/products/semiology-gift-cards"
  },
  {
    "giftCardId": "cmtb62p6j001j94iy0wbk6jyl",
    "merchant": "Send gifts and wishes to your beloved ones",
    "title": "E-Gift card - Send gifts and wishes to your beloved ones",
    "expectedUrl": "https://www.neraidochora.gr/en-gb/e-gift-card?srsltid",
    "newUrl": "https://www.neraidochora.gr/en-gb/e-gift-card"
  },
  {
    "giftCardId": "cmtb62s09001z94iy1ofsp7v6",
    "merchant": "Serkos",
    "title": "Serkos Gift Card",
    "expectedUrl": "https://www.serkos.gr/en/gift-card?srsltid",
    "newUrl": "https://www.serkos.gr/en/gift-card"
  },
  {
    "giftCardId": "cmtb62sem002194iy651slae1",
    "merchant": "Sfinx",
    "title": "Sfinx Gift Card",
    "expectedUrl": "https://sfinx.gr/products/gift-card?srsltid",
    "newUrl": "https://sfinx.gr/products/gift-card"
  },
  {
    "giftCardId": "cmtb62tub002994iy1zvxngz9",
    "merchant": "TeleioPlayRoom.gr",
    "title": "TeleioPlayRoom.gr Gift Card",
    "expectedUrl": "https://www.teleioplayroom.gr/products/gift-card?srsltid",
    "newUrl": "https://www.teleioplayroom.gr/products/gift-card"
  },
  {
    "giftCardId": "cmtb62ujl002d94iyrdhk5afr",
    "merchant": "Thejerkins",
    "title": "Thejerkins Gift Card",
    "expectedUrl": "https://thejerkins.com.gr/products/gift-card?srsltid",
    "newUrl": "https://thejerkins.com.gr/products/gift-card"
  },
  {
    "giftCardId": "cmta5nyst002654iyxa6404qo",
    "merchant": "Toys.gr",
    "title": "Δωροκάρτα Toys.gr",
    "expectedUrl": "https://www.toys.gr/giftcard-toysgr?srsltid=AfmBOopHe1JYXA8bgQ-3bx7gJAfgE7dW0sC72mBCtGQ3P7XeU7pKi-pd",
    "newUrl": "https://www.toys.gr/giftcard-toysgr"
  },
  {
    "giftCardId": "cmta4z6cu0043sciymjjhzvy3",
    "merchant": "Ullapopken",
    "title": "Gift Cards | Ulla Popken",
    "expectedUrl": "https://www.ullapopken.gr/gift-cards?srsltid=AfmBOooQRBfu9Zor_5dwdUxhGlJ0BNtgiOL_Hw4p8T907lz3Unpt5K69",
    "newUrl": "https://www.ullapopken.gr/gift-cards"
  },
  {
    "giftCardId": "cmta4z7uf0049sciyu0lkupmq",
    "merchant": "Vibrant Beauty",
    "title": "Vibrant Beauty Gift Card",
    "expectedUrl": "https://vibrantbeauty.gr/product/giftcard/?srsltid",
    "newUrl": "https://vibrantbeauty.gr/product/giftcard/"
  },
  {
    "giftCardId": "cmta4z8wh004dsciyp2mmpzw7",
    "merchant": "Wildsouls",
    "title": "Gift Card - Wild Souls",
    "expectedUrl": "https://www.wildsouls.gr/en/product/gift-card/?srsltid=AfmBOopH8yhtqhcz_4N5Cdpr6omZYlt8AgNRtZK3rWDc67sv9_bUeoqa",
    "newUrl": "https://www.wildsouls.gr/en/product/gift-card/"
  },
  {
    "giftCardId": "cmta4z9v3004hsciy7b57j3u9",
    "merchant": "Zerogravity",
    "title": "Zero Gravity Gift Card",
    "expectedUrl": "https://www.zerogravity.gr/collections/gift-card?srsltid=AfmBOoqgLRsSyCY1tD0_hBRTgjXh5XLlVyXne62wSeNM-pAyRlLueY7F",
    "newUrl": "https://www.zerogravity.gr/collections/gift-card"
  }
] as const;
const DUPLICATE_CANDIDATES = [
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb77tnt004ndkiyw1tey12d",
    "merchantId": "cmtb77ti7004mdkiyn5wn9fgi",
    "merchantName": "Chania Culture",
    "giftCardId": "cmtb77tnt004ndkiyw1tey12d",
    "giftCardTitle": "Chania Culture Gift Card",
    "code": "DUPLICATE_CARD_TITLE_SAME_MERCHANT",
    "detail": "Same normalized title appears 2 times for this merchant.",
    "value": "cmtb77tnt004ndkiyw1tey12d|cmtb7r23t0004u8iyh8gmkixy"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb7r23t0004u8iyh8gmkixy",
    "merchantId": "cmtb77ti7004mdkiyn5wn9fgi",
    "merchantName": "Chania Culture",
    "giftCardId": "cmtb7r23t0004u8iyh8gmkixy",
    "giftCardTitle": "Chania Culture Gift Card",
    "code": "DUPLICATE_CARD_TITLE_SAME_MERCHANT",
    "detail": "Same normalized title appears 2 times for this merchant.",
    "value": "cmtb77tnt004ndkiyw1tey12d|cmtb7r23t0004u8iyh8gmkixy"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1in6000deq8iyzrf26jcw",
    "merchantId": "cmta1in0q00ddq8iy9ou6k8vv",
    "merchantName": "Kois Optics",
    "giftCardId": "cmta1in6000deq8iyzrf26jcw",
    "giftCardTitle": "Kois Optics Gift Card",
    "code": "DUPLICATE_CARD_TITLE_SAME_MERCHANT",
    "detail": "Same normalized title appears 2 times for this merchant.",
    "value": "cmtb7r3ne000bu8iyhr8e822r|cmta1in6000deq8iyzrf26jcw"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1in6000deq8iyzrf26jcw",
    "merchantId": "cmta1in0q00ddq8iy9ou6k8vv",
    "merchantName": "Kois Optics",
    "giftCardId": "cmta1in6000deq8iyzrf26jcw",
    "giftCardTitle": "Kois Optics Gift Card",
    "code": "DUPLICATE_OFFICIAL_URL",
    "detail": "Canonical official URL is shared by 2 gift-card records.",
    "value": "https://kois-optics.gr/el/products/giftcard"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb7r3ne000bu8iyhr8e822r",
    "merchantId": "cmta1in0q00ddq8iy9ou6k8vv",
    "merchantName": "Kois Optics",
    "giftCardId": "cmtb7r3ne000bu8iyhr8e822r",
    "giftCardTitle": "KOIS Optics Gift Card",
    "code": "DUPLICATE_CARD_TITLE_SAME_MERCHANT",
    "detail": "Same normalized title appears 2 times for this merchant.",
    "value": "cmtb7r3ne000bu8iyhr8e822r|cmta1in6000deq8iyzrf26jcw"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb7r3ne000bu8iyhr8e822r",
    "merchantId": "cmta1in0q00ddq8iy9ou6k8vv",
    "merchantName": "Kois Optics",
    "giftCardId": "cmtb7r3ne000bu8iyhr8e822r",
    "giftCardTitle": "KOIS Optics Gift Card",
    "code": "DUPLICATE_OFFICIAL_URL",
    "detail": "Canonical official URL is shared by 2 gift-card records.",
    "value": "https://kois-optics.gr/el/products/giftcard"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1ldih00owq8iybi4h3dxo",
    "merchantId": "cmta1ldb100ovq8iysbonr92k",
    "merchantName": "Laura Ashley",
    "giftCardId": "cmta1ldih00owq8iybi4h3dxo",
    "giftCardTitle": "Gift Card Laura Ashley",
    "code": "DUPLICATE_OFFICIAL_URL",
    "detail": "Canonical official URL is shared by 2 gift-card records.",
    "value": "https://lauraashleyshop.gr/products/gift-card-laura-ashley"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmta421t70002t8iywrh9oyoy",
    "merchantId": "cmta1ldb100ovq8iysbonr92k",
    "merchantName": "Laura Ashley",
    "giftCardId": "cmta421t70002t8iywrh9oyoy",
    "giftCardTitle": "Laura Ashley Gift Card",
    "code": "DUPLICATE_OFFICIAL_URL",
    "detail": "Canonical official URL is shared by 2 gift-card records.",
    "value": "https://lauraashleyshop.gr/products/gift-card-laura-ashley"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb7r1ep0001u8iyqwzxbtq4",
    "merchantId": "cmtb7r18u0000u8iyfdfhu3mf",
    "merchantName": "LEGO Store Greece",
    "giftCardId": "cmtb7r1ep0001u8iyqwzxbtq4",
    "giftCardTitle": "LEGO Store Greece Gift Card",
    "code": "DUPLICATE_OFFICIAL_URL",
    "detail": "Canonical official URL is shared by 2 gift-card records.",
    "value": "https://lego.storegreece.gr/upiresies/gift-cards"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1jjkg00heq8iyq7zpj3cf",
    "merchantId": "cmta1jjde00hdq8iymhdvuagw",
    "merchantName": "Storegreece",
    "giftCardId": "cmta1jjkg00heq8iyq7zpj3cf",
    "giftCardTitle": "e-Gift Card",
    "code": "DUPLICATE_OFFICIAL_URL",
    "detail": "Canonical official URL is shared by 2 gift-card records.",
    "value": "https://lego.storegreece.gr/upiresies/gift-cards"
  }
] as const;
const VERY_SPECIFIC = [
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb77onx003ydkiy1syn6iip",
    "merchantId": "cmtb77ojh003xdkiy4cwko7oy",
    "merchantName": "Τζούγκαρης",
    "giftCardId": "cmtb77onx003ydkiy1syn6iip",
    "giftCardTitle": "Τζούγκαρης Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://tzougaris.gr/en/shop/wps_wgm_giftcard/tzougaris-giftcard-300/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmt8o9lfb000130iysqk7vztw",
    "merchantId": "cmt8o9l84000030iymso77cud",
    "merchantName": "Access Fashion",
    "giftCardId": "cmt8o9lfb000130iysqk7vztw",
    "giftCardTitle": "Access Fashion Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.accessfashion.gr/gift-card-100"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1k4ye00juq8iyeeswbskm",
    "merchantId": "cmta1k4re00jtq8iy6du8abjr",
    "merchantName": "Animusmassage",
    "giftCardId": "cmta1k4ye00juq8iyeeswbskm",
    "giftCardTitle": "Gift certificate",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://animusmassage.gr/gift-card-2/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1hgn5008wq8iy1ksubp16",
    "merchantId": "cmta1hgfm008vq8iy2pi8rd5p",
    "merchantName": "Avvento Shoes",
    "giftCardId": "cmta1hgn5008wq8iy1ksubp16",
    "giftCardTitle": "Avvento Shoes Gift Card 50€",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.avvento-shoes.gr/avvento/gift-card-50eu-gift-card-50eu-101"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1mj7f00tcq8iyfg3pom6s",
    "merchantId": "cmta1mj0k00tbq8iyprndlmpp",
    "merchantName": "Babyllama",
    "giftCardId": "cmta1mj7f00tcq8iyfg3pom6s",
    "giftCardTitle": "Gift Card | Δωροκάρτα | Baby Llama",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.babyllama.gr/shop/diakosmisi-diakosmitika/set-dorou-%ce%b2%cf%81%ce%b5%cf%86%ce%b9%ce%ba%ce%b5%cf%82-%cf%86%cf%89%ce%bb%ce%b9%ce%b5%cf%82/gift-card-2/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb7703h000fdkiy6xz320nd",
    "merchantId": "cmtb76zyk000edkiyoal0zyeg",
    "merchantName": "Caravin",
    "giftCardId": "cmtb7703h000fdkiy6xz320nd",
    "giftCardTitle": "Caravin Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.caravin.gr/el/giftcard-2/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1kl4b00loq8iyupsiybh2",
    "merchantId": "cmta1kky600lnq8iybuxpk2tm",
    "merchantName": "Creatorshop",
    "giftCardId": "cmta1kl4b00loq8iyupsiybh2",
    "giftCardTitle": "Creatorshop Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://creatorshop.gr/products/gift-card-1"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb77v6h004vdkiy54z2aiui",
    "merchantId": "cmtb77v1h004udkiyfr8vdjju",
    "merchantName": "Cuka",
    "giftCardId": "cmtb77v6h004vdkiy54z2aiui",
    "giftCardTitle": "Cuka Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://cuka.gr/shop/new-collection-ss-26-all/gift-card-2/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1fa1z001rq8iyz9bikmb5",
    "merchantId": "cmta1f9vp001qq8iy90mef58l",
    "merchantName": "DigiShark",
    "giftCardId": "cmta1fa1z001rq8iyz9bikmb5",
    "giftCardTitle": "DigiShark Δωροκάρτα",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://digishark.gr/product/giftcard26/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1hxy000asq8iyykd06tm3",
    "merchantId": "cmta1hxrm00arq8iyhvy95v45",
    "merchantName": "Doctorfish",
    "giftCardId": "cmta1hxy000asq8iyykd06tm3",
    "giftCardTitle": "Δωροκάρτα Spa and Nail Bar στην Αθήνα",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.doctorfish.gr/gift-card-1"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta4yh9u0017sciy4yb84cy2",
    "merchantId": "cmta4yh320016sciyuh3ghceq",
    "merchantName": "Familychef",
    "giftCardId": "cmta4yh9u0017sciy4yb84cy2",
    "giftCardTitle": "GIFT CARDS – FamilyChef",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://familychef.gr/en/products/100-gift-card"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1i8n300boq8iydt4qw67b",
    "merchantId": "cmta1i8g400bnq8iyw7ifw6pq",
    "merchantName": "Fantasea",
    "giftCardId": "cmta1i8n300boq8iydt4qw67b",
    "giftCardTitle": "Fantasea Δωροεπιταγή 100€",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.fantasea.gr/product/doroepitagi-100-1034/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb7774t001fdkiyhs33c0v6",
    "merchantId": "cmtb776zn001edkiyarmmetay",
    "merchantName": "God Bless Women",
    "giftCardId": "cmtb7774t001fdkiyhs33c0v6",
    "giftCardTitle": "25 CHF Gift card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://godblesswomen.gr/products/25-chf-gift-card/236339811/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1ic4800c4q8iyph5olsg8",
    "merchantId": "cmta1ibyg00c3q8iy7eqka0ch",
    "merchantName": "Gymbeam",
    "giftCardId": "cmta1ic4800c4q8iyph5olsg8",
    "giftCardTitle": "Δωροκάρτα - GymBeam",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://gymbeam.gr/gift-card-1.html"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb62kft000t94iyoh4z8szg",
    "merchantId": "cmtb62kbd000s94iy55au674v",
    "merchantName": "Hobby",
    "giftCardId": "cmtb62kft000t94iyoh4z8szg",
    "giftCardTitle": "Δωροεπιταγές",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.hobby.gr/giftcard-2"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb78fkx007odkiylrl8o7it",
    "merchantId": "cmtb78ffp007ndkiyn4woc6vx",
    "merchantName": "Hobbywood",
    "giftCardId": "cmtb78fkx007odkiylrl8o7it",
    "giftCardTitle": "Hobbywood Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.hobbywood.gr/GIFTCARD100"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1kqsr00mcq8iyjmcu7lpg",
    "merchantId": "cmta1kqmj00mbq8iyq43jivnk",
    "merchantName": "Houseoftennis",
    "giftCardId": "cmta1kqsr00mcq8iyjmcu7lpg",
    "giftCardTitle": "Gift Card – House Of Tennis",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://houseoftennis.gr/product-category/wps_wgm_giftcard-2/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta4ykx8001lsciyu1m24dqd",
    "merchantId": "cmta4ykr0001ksciypzktgyzf",
    "merchantName": "Iaso",
    "giftCardId": "cmta4ykx8001lsciyu1m24dqd",
    "giftCardTitle": "IASO presents “IASO Gift Card” for Mammography",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.iaso.gr/en/news/details/2020/10/13/to-iaso-parousiazi-tin-iaso-gift-card-gia-mastografia"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1ihz900csq8iy52zsyahm",
    "merchantId": "cmta1ihsb00crq8iy83hvfzop",
    "merchantName": "Imanoglou",
    "giftCardId": "cmta1ihz900csq8iy52zsyahm",
    "giftCardTitle": "Δωροκάρτα",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://imanoglou.gr/en/catalogue/giftcard_50/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1k8xm00kaq8iy3sqsa28b",
    "merchantId": "cmta1k8qh00k9q8iyaho07xw2",
    "merchantName": "Iridaspa",
    "giftCardId": "cmta1k8xm00kaq8iy3sqsa28b",
    "giftCardTitle": "Δωροκάρτα - Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.iridaspa.gr/product/gift-card-10/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1ksaz00miq8iyz8knfxq5",
    "merchantId": "cmta1ks4x00mhq8iydfmn5xou",
    "merchantName": "Kalousos",
    "giftCardId": "cmta1ksaz00miq8iyz8knfxq5",
    "giftCardTitle": "Kalousos Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.kalousos.gr/el/dorokarta-gift-card-50eur.html"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1gpu8006oq8iygdj4ivp4",
    "merchantId": "cmta1gpoa006nq8iyndgs0ihk",
    "merchantName": "Kasparianjewels",
    "giftCardId": "cmta1gpu8006oq8iygdj4ivp4",
    "giftCardTitle": "Δωροκάρτα των καταστημάτων μας σε ότι θέλετε!",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.kasparianjewels.gr/gift-card-0ven"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1ilzk00d8q8iy2h8zeglu",
    "merchantId": "cmta1iltx00d7q8iyerhiz1p8",
    "merchantName": "Kazi",
    "giftCardId": "cmta1ilzk00d8q8iy2h8zeglu",
    "giftCardTitle": "Kazi Gift Card 80€",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://kazi.gr/gift-card-519380-1.html"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta4yna7001vsciyjdd4avht",
    "merchantId": "cmta4yn3z001usciyrd2sxl9u",
    "merchantName": "Kidscom",
    "giftCardId": "cmta4yna7001vsciyjdd4avht",
    "giftCardTitle": "Gift card - Kidscom.gr",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.kidscom.gr/gift-card-1"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmt8movjv00065ciysur9vq6l",
    "merchantId": "cmt8movdd00055ciyebq5kzv5",
    "merchantName": "KORRES",
    "giftCardId": "cmt8movjv00065ciysur9vq6l",
    "giftCardTitle": "KORRES Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.korres.com/products/korres-e-gift-card-26"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1n9za00w8q8iy7ywbxcsm",
    "merchantId": "cmta1n9sv00w7q8iypja3wgnv",
    "merchantName": "Krikisbeauty",
    "giftCardId": "cmta1n9za00w8q8iy7ywbxcsm",
    "giftCardTitle": "Krikis Beauty Gift Card 20€",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://krikisbeauty.gr/shop/gift-card-20e-2/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1grv5006uq8iye4j038gk",
    "merchantId": "cmta1grl4006tq8iy8pmzmbvn",
    "merchantName": "Laloo",
    "giftCardId": "cmta1grv5006uq8iye4j038gk",
    "giftCardTitle": "Laloo Gift Card 30€",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://laloo.gr/el/250-gift-cards"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb6uw0e002o3giyafr6pxqp",
    "merchantId": "cmtb6uvw3002n3giyqr9kvyec",
    "merchantName": "Linson Moto",
    "giftCardId": "cmtb6uw0e002o3giyafr6pxqp",
    "giftCardTitle": "Linson Moto Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://linsonmoto.gr/dwrokarta-200"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta5nrd7001354iyo6sumjdq",
    "merchantId": "cmta5nr81001254iy1l0ypsfm",
    "merchantName": "Londonboutique",
    "giftCardId": "cmta5nrd7001354iyo6sumjdq",
    "giftCardTitle": "London Boutique Gift card - London Βoutique",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.londonboutique.gr/product/london-boutique-gift-card-6/?srsltid=AfmBOoplBkxynnLo-jtk_SI0AXzE9nfxHEuDaAnHJoAWkxxbbtBm45L9"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb77bgd0021dkiyy3u2x8qn",
    "merchantId": "cmtb77bbd0020dkiyyi6uurk8",
    "merchantName": "Lookshop",
    "giftCardId": "cmtb77bgd0021dkiyy3u2x8qn",
    "giftCardTitle": "Lookshop Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://lookshop.gr/giftcard2.html"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta5ns2z001754iyqm8xijsp",
    "merchantId": "cmta5nrxg001654iyoybl2dln",
    "merchantName": "Madeofglass",
    "giftCardId": "cmta5ns2z001754iyqm8xijsp",
    "giftCardTitle": "Made of Glass Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://madeofglass.gr/products/made-of-glass-gift-card-1?srsltid=AfmBOormg545Om3unDfjD1P0AqYJqz0E0cSFjiiCbFOGTbyuIkaYdZ4y"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta4ytua002nsciye5jdpjc2",
    "merchantId": "cmta4yto2002msciy14cp15ty",
    "merchantName": "Megafitness",
    "giftCardId": "cmta4ytua002nsciye5jdpjc2",
    "giftCardTitle": "Megafitness Gift Card 300,00€",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.megafitness.gr/en/megafitness-gift-card-300-00%E2%82%AC-104325"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1kb6y00kkq8iy5q5ciyh4",
    "merchantId": "cmta1kb0g00kjq8iy0xb4lwrk",
    "merchantName": "Mentortravel",
    "giftCardId": "cmta1kb6y00kkq8iy5q5ciyh4",
    "giftCardTitle": "Gift card | Δωροκάρτα",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.mentortravel.gr/gift-card-2"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb789dc006udkiyns09pnli",
    "merchantId": "cmtb7898i006tdkiypwp1jv9x",
    "merchantName": "Mom & Me",
    "giftCardId": "cmtb789dc006udkiyns09pnli",
    "giftCardTitle": "Mom & Me Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://momandme.gr/product/gift-card-100/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta5nucz001j54iyk2uep1aq",
    "merchantId": "cmta5nu7u001i54iy26l668bf",
    "merchantName": "Myprotein",
    "giftCardId": "cmta5nucz001j54iyk2uep1aq",
    "giftCardTitle": "Myprotein Gift Voucher, £50",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.myprotein.gr/p/protein-accessories/myprotein-gift-voucher-50/10530834/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1j2rw00fgq8iydjopixyl",
    "merchantId": "cmta1j2m300ffq8iyt6u5plxe",
    "merchantName": "Myrtia",
    "giftCardId": "cmta1j2rw00fgq8iydjopixyl",
    "giftCardTitle": "Myrtia Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://myrtia.gr/el/25-gift-cards"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb6uy8d00303giy23wvv4xn",
    "merchantId": "cmtb6uy3n002z3giyohz3pcwu",
    "merchantName": "NaniNails.gr",
    "giftCardId": "cmtb6uy8d00303giy23wvv4xn",
    "giftCardTitle": "NaniNails.gr Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.naninails.gr/dorokarta-axias-20-eur/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb7i4z6001d04iynhzy9379",
    "merchantId": "cmtb7i4tc001c04iydbkml154",
    "merchantName": "Oriad Athens",
    "giftCardId": "cmtb7i4z6001d04iynhzy9379",
    "giftCardTitle": "Oriad Athens Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://oriadathens.com/product/gift-card-50e/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb6v0i7003c3giyqzykbead",
    "merchantId": "cmtb6v0di003b3giyxpscbnbo",
    "merchantName": "Parenting Courses",
    "giftCardId": "cmtb6v0i7003c3giyqzykbead",
    "giftCardTitle": "Parenting Courses Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.parentingcourses.gr/pages/gift-card-2"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1gvbd0078q8iyfrpuq3og",
    "merchantId": "cmta1guui0077q8iybyqma2gp",
    "merchantName": "Phoskitchenware",
    "giftCardId": "cmta1gvbd0078q8iyfrpuq3og",
    "giftCardTitle": "Phos Kitchenware Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.phoskitchenware.gr/en/content/10-giftcards"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta5nwz8001x54iybk0fzt5z",
    "merchantId": "cmta5nwum001w54iy1kd87zna",
    "merchantName": "Purity Vision COM",
    "giftCardId": "cmta5nwz8001x54iybk0fzt5z",
    "giftCardTitle": "Purity Vision COM Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.purityvision.gr/products/gift-card-60-eur"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb6v2p6003o3giy2gadgy5g",
    "merchantId": "cmtb6v2jj003n3giy074shjfa",
    "merchantName": "Sandalista",
    "giftCardId": "cmtb6v2p6003o3giy2gadgy5g",
    "giftCardTitle": "Sandalista Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://sandalista.gr/en/p/wps_wgm_giftcard-2/sgc/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta5nxca001z54iyk1x3ihrh",
    "merchantId": "cmta5nx79001y54iyjatwauue",
    "merchantName": "sexodonia",
    "giftCardId": "cmta5nxca001z54iyk1x3ihrh",
    "giftCardTitle": "sexodonia Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.sexodonia.gr/%CE%B4%CF%89%CF%81%CE%B1-%CE%BA%CE%B1%CE%B9-%CF%80%CE%B1%CE%B9%CF%87%CE%BD%CE%B9%CE%B4%CE%B9%CE%B1/4073-gift-voucher-75-eur.html"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1ffa4002bq8iy5k6w34t1",
    "merchantId": "cmta1ff3n002aq8iyrx6zswhx",
    "merchantName": "Shopdali",
    "giftCardId": "cmta1ffa4002bq8iy5k6w34t1",
    "giftCardTitle": "DA|LI Littles Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://shopdali.gr/products/littles-gift-card-100"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta5ny2d002354iyvhj9mkz0",
    "merchantId": "cmta5nxxp002254iy4fqx9dbp",
    "merchantName": "Smaragdasart",
    "giftCardId": "cmta5ny2d002354iyvhj9mkz0",
    "giftCardTitle": "Smaragdas Art E-Δωροκάρτα 200€",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://smaragdasart.gr/el/card/171-e-gift-card-100-.html"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1l5p700o0q8iyqwcjwsy7",
    "merchantId": "cmta1l5jq00nzq8iy8cw0ryyj",
    "merchantName": "Sportsdivision",
    "giftCardId": "cmta1l5p700o0q8iyqwcjwsy7",
    "giftCardTitle": "Gift Card | Sports Division",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://sportsdivision.gr/shop/wps_wgm_giftcard-2/ilektroniki-dorokarta-sports-division/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb6v4wo00403giy1xrcqmye",
    "merchantId": "cmtb6v4rd003z3giylhtezhya",
    "merchantName": "Stem Toys",
    "giftCardId": "cmtb6v4wo00403giy1xrcqmye",
    "giftCardTitle": "Stem Toys Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://stem-toys.gr/product/%CE%B4%CF%89%CF%81%CE%BF%CE%B5%CF%80%CE%B9%CF%84%CE%B1%CE%B3%CE%AE-50-e/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb78bqw0074dkiyvvhnv4d4",
    "merchantId": "cmtb78bm30073dkiym0hq9504",
    "merchantName": "Stemalaser",
    "giftCardId": "cmtb78bqw0074dkiyvvhnv4d4",
    "giftCardTitle": "Stemalaser Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://stemalaser.gr/en/product/gift-card-2/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1jkmg00hiq8iyeoo1j71v",
    "merchantId": "cmta1jkec00hhq8iymr4c27mz",
    "merchantName": "Strata Shop",
    "giftCardId": "cmta1jkmg00hiq8iyeoo1j71v",
    "giftCardTitle": "Δωροκάρτα - strata-shop.gr",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://strata-shop.gr/product/dorokarta-40/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1jmup00hqq8iy8s59w364",
    "merchantId": "cmta1jmn200hpq8iywjlzcjj1",
    "merchantName": "Talosgems",
    "giftCardId": "cmta1jmup00hqq8iy8s59w364",
    "giftCardTitle": "Δωροκάρτα - Talos Gems - Φυσικά Πετρώματα, Κρύσταλλα ...",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.talosgems.gr/product-category/egiftcard-2/"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb77n4m003qdkiyjf9v5mzc",
    "merchantId": "cmtb77mzs003pdkiyc12og14q",
    "merchantName": "Topgreekwines",
    "giftCardId": "cmtb77n4m003qdkiyjf9v5mzc",
    "giftCardTitle": "Topgreekwines Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.topgreekwines.gr/en-gb/gift-voucher-50%E2%82%AC-wines.html"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta5nzvj002c54iyh4tnx9jy",
    "merchantId": "cmta5nzqx002b54iyjbin14o4",
    "merchantName": "WARAGOD",
    "giftCardId": "cmta5nzvj002c54iyh4tnx9jy",
    "giftCardTitle": "WARAGOD Gift Card",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.waragod.gr/en/products/gift-voucher-de-30"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1k33j00jmq8iy7dosx0mg",
    "merchantId": "cmta1k2vw00jlq8iy0gndm22x",
    "merchantName": "Wine24shop",
    "giftCardId": "cmta1k33j00jmq8iy7dosx0mg",
    "giftCardTitle": "Gift Card 20 euro - Wine24shop",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.wine24shop.gr/dorokarta-100-euro.el.aspx"
  },
  {
    "severity": "MEDIUM",
    "entityType": "GIFT_CARD",
    "entityId": "cmtb78e22007gdkiyojyhhg7e",
    "merchantId": "cmtb78dwy007fdkiyd2xzj5l1",
    "merchantName": "Zador",
    "giftCardId": "cmtb78e22007gdkiyojyhhg7e",
    "giftCardTitle": "Gift Voucher 100 EUR",
    "code": "VERY_SPECIFIC_OFFICIAL_URL",
    "detail": "Official URL appears tied to a denomination or very specific product path; review canonical program URL.",
    "value": "https://www.zador.gr/en/products/gift-voucher-100-eur"
  }
] as const;
const DOMAIN_MISMATCHES = [
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1g5lj004tq8iy2gi1o7hn",
    "merchantId": "cmta1g5ei004sq8iyj1nwtg24",
    "merchantName": "Kotsovolos",
    "giftCardId": "cmta1g5lj004tq8iy2gi1o7hn",
    "giftCardTitle": "Kotsovolos Δωροκάρτα – Gift Card!",
    "code": "OFFICIAL_URL_DOMAIN_MISMATCH",
    "detail": "Gift-card official URL host differs from merchant website host; could be a reseller or wrong merchant relation.",
    "value": "https://www.kotsovolos.gr -> https://kotsovolos-b2b.giftcards-store.com/el"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmta1g612004uq8iy6ctyhbtp",
    "merchantId": "cmt8hesrb000fa8iycuggb6wc",
    "merchantName": "Puma Greece",
    "giftCardId": "cmta1g612004uq8iy6ctyhbtp",
    "giftCardTitle": "Gift Card Terms & Conditions",
    "code": "OFFICIAL_URL_DOMAIN_MISMATCH",
    "detail": "Gift-card official URL host differs from merchant website host; could be a reseller or wrong merchant relation.",
    "value": "https://eu.puma.com -> https://giftcard.puma.com/de/en/TERMS_AND_CONDITIONS.html"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmta5nyde002454iyc6vaizw0",
    "merchantId": "cmta1fozl0036q8iyfva5aozo",
    "merchantName": "Thomann",
    "giftCardId": "cmta5nyde002454iyc6vaizw0",
    "giftCardTitle": "Thomann Gift Card",
    "code": "OFFICIAL_URL_DOMAIN_MISMATCH",
    "detail": "Gift-card official URL host differs from merchant website host; could be a reseller or wrong merchant relation.",
    "value": "https://thomann.de -> https://www.thomann.gr/gift_voucher.html"
  }
] as const;
const BAD_HTTP = [
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmt79iczq000184iyn0v8cypj",
    "merchantId": "cmt79icwc000084iyqmpbd9de",
    "merchantName": "AEGEAN",
    "giftCardId": "cmt79iczq000184iyn0v8cypj",
    "giftCardTitle": "AEGEAN Gift Card",
    "code": "LATEST_SNAPSHOT_BAD_HTTP",
    "detail": "Latest production verification snapshot returned HTTP 403.",
    "value": "https://el.aegeanair.com/flight-deals/gift-card"
  },
  {
    "severity": "HIGH",
    "entityType": "GIFT_CARD",
    "entityId": "cmt79if7j000o84iymh0hdqkh",
    "merchantId": "cmt79if46000n84iyg23kadng",
    "merchantName": "IKEA",
    "giftCardId": "cmt79if7j000o84iymh0hdqkh",
    "giftCardTitle": "IKEA Gift Card",
    "code": "LATEST_SNAPSHOT_BAD_HTTP",
    "detail": "Latest production verification snapshot returned HTTP 403.",
    "value": "https://www.ikea.gr/agora-dorokartas-ikea/"
  }
] as const;

async function main() {
  const APPLY = process.argv.includes("--apply");
  const { prisma } = await import("../../lib/prisma");

  console.log("Dorokartes URL Cleanup Batch 1 v1.1");
  console.log("==============================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN (read-only)"}`);
  console.log(`Tracking URLs to clean: ${TRACKING_FIXES.length}`);
  console.log(`Duplicate card/url candidate issues (report only): ${DUPLICATE_CANDIDATES.length}`);
  console.log(`Very-specific URL issues (report only): ${VERY_SPECIFIC.length}`);
  console.log(`Domain mismatches (report only): ${DOMAIN_MISMATCHES.length}`);
  console.log(`Bad HTTP snapshots (report only): ${BAD_HTTP.length}`);
  console.log("");

  const pending: typeof TRACKING_FIXES[number][] = [];
  let alreadyClean = 0;

  for (const fix of TRACKING_FIXES) {
    const card = await prisma.giftCard.findUnique({ where: { id: fix.giftCardId } });
    if (!card) throw new Error(`Gift card not found: ${fix.giftCardId}`);

    if (card.officialUrl === fix.newUrl) {
      alreadyClean++;
      console.log(`ALREADY CLEAN ${fix.giftCardId} :: ${fix.merchant}`);
      console.log(`  ${fix.newUrl}`);
      continue;
    }

    if (card.officialUrl !== fix.expectedUrl) {
      throw new Error(
        `Safety guard failed for ${fix.giftCardId}: expected either "${fix.expectedUrl}" or "${fix.newUrl}", found "${card.officialUrl}"`
      );
    }

    pending.push(fix);
    console.log(`TRACKING CLEANUP ${fix.giftCardId} :: ${fix.merchant}`);
    console.log(`  ${fix.expectedUrl}`);
    console.log(`  -> ${fix.newUrl}`);
  }

  console.log("");
  console.log(`Pending writes: ${pending.length}`);
  console.log(`Already clean: ${alreadyClean}`);

  console.log("");
  console.log("REPORT-ONLY: duplicate candidates");
  const seen = new Set<string>();
  for (const i of DUPLICATE_CANDIDATES) {
    const key = `${i.code}|${i.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${i.code} :: ${i.merchantName} :: ${i.giftCardTitle} :: ${i.value ?? ""}`);
  }

  console.log("");
  console.log("REPORT-ONLY: domain mismatches");
  for (const i of DOMAIN_MISMATCHES) {
    console.log(`  ${i.merchantName} :: ${i.giftCardTitle} :: ${i.value ?? ""}`);
  }

  console.log("");
  console.log("REPORT-ONLY: bad HTTP snapshots");
  for (const i of BAD_HTTP) {
    console.log(`  ${i.merchantName} :: ${i.giftCardTitle} :: ${i.value ?? ""}`);
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No database writes performed.");
    console.log("Apply will ONLY remove ?srsltid=... from the 46 guarded official URLs.");
    console.log("Duplicates, very-specific URLs, domain mismatches and HTTP findings remain report-only.");
    await prisma.$disconnect();
    return;
  }

  if (pending.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const fix of pending) {
          const result = await tx.giftCard.updateMany({
            where: {
              id: fix.giftCardId,
              officialUrl: fix.expectedUrl,
            },
            data: { officialUrl: fix.newUrl },
          });

          if (result.count !== 1) {
            throw new Error(
              `Transactional safety guard failed for ${fix.giftCardId}: expected exactly 1 row, updated ${result.count}`
            );
          }
        }
      },
      {
        maxWait: 10000,
        timeout: 60000,
      }
    );
  }

  // Post-apply verification.
  for (const fix of TRACKING_FIXES) {
    const card = await prisma.giftCard.findUnique({
      where: { id: fix.giftCardId },
      select: { officialUrl: true },
    });
    if (!card || card.officialUrl !== fix.newUrl) {
      throw new Error(`Post-apply verification failed for ${fix.giftCardId}`);
    }
  }

  console.log("");
  console.log(`APPLIED: ${pending.length} official URLs cleaned in this run.`);
  console.log(`Already clean before this run: ${alreadyClean}.`);
  console.log(`Verified clean total: ${TRACKING_FIXES.length}.`);
  console.log("Only srsltid tracking parameters were removed.");
  console.log("No cards, merchants, slugs, titles, statuses, relations or verification fields were changed.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("");
  console.error("FAILED:", error);
  process.exitCode = 1;
});
