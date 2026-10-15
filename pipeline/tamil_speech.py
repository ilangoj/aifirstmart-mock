"""Tamil text -> words the Tamil voice reads correctly: numbers, amounts, codes, phone numbers, emails as words.
Used by narrate.py before recording; safe to run on text that is already normalised."""
import re

ONES = ['பூஜ்யம்', 'ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு', 'ஐந்து', 'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது', 'பத்து', 'பதினொன்று', 'பன்னிரண்டு',
        'பதின்மூன்று', 'பதினான்கு', 'பதினைந்து', 'பதினாறு', 'பதினேழு', 'பதினெட்டு', 'பத்தொன்பது']
TENS = {2: ('இருபது', 'இருபத்து'), 3: ('முப்பது', 'முப்பத்து'), 4: ('நாற்பது', 'நாற்பத்து'), 5: ('ஐம்பது', 'ஐம்பத்து'), 6: ('அறுபது', 'அறுபத்து'),
        7: ('எழுபது', 'எழுபத்து'), 8: ('எண்பது', 'எண்பத்து'), 9: ('தொண்ணூறு', 'தொண்ணூற்று')}
HUND = {1: ('நூறு', 'நூற்று'), 2: ('இருநூறு', 'இருநூற்று'), 3: ('முந்நூறு', 'முந்நூற்று'), 4: ('நானூறு', 'நானூற்று'), 5: ('ஐநூறு', 'ஐநூற்று'),
        6: ('அறுநூறு', 'அறுநூற்று'), 7: ('எழுநூறு', 'எழுநூற்று'), 8: ('எண்ணூறு', 'எண்ணூற்று'), 9: ('தொள்ளாயிரம்', 'தொள்ளாயிரத்து')}
THOU = {1: ('ஆயிரம்', 'ஆயிரத்து'), 2: ('இரண்டாயிரம்', 'இரண்டாயிரத்து'), 3: ('மூவாயிரம்', 'மூவாயிரத்து'), 4: ('நான்காயிரம்', 'நான்காயிரத்து'),
        5: ('ஐயாயிரம்', 'ஐயாயிரத்து'), 6: ('ஆறாயிரம்', 'ஆறாயிரத்து'), 7: ('ஏழாயிரம்', 'ஏழாயிரத்து'), 8: ('எட்டாயிரம்', 'எட்டாயிரத்து'),
        9: ('ஒன்பதாயிரம்', 'ஒன்பதாயிரத்து'), 10: ('பத்தாயிரம்', 'பத்தாயிரத்து')}

def words(n):
    n = int(n)
    if n < 20: return ONES[n]
    if n < 100:
        t, o = divmod(n, 10); return TENS[t][0] if not o else f'{TENS[t][1]} {ONES[o]}'
    if n < 1000:
        h, r = divmod(n, 100); return HUND[h][0] if not r else f'{HUND[h][1]} {words(r)}'
    if n < 100000:
        th, r = divmod(n, 1000)
        if th in THOU: head = THOU[th]
        else: w = words(th); head = (f'{w} ஆயிரம்', f'{w} ஆயிரத்து')
        return head[0] if not r else f'{head[1]} {words(r)}'
    l, r = divmod(n, 100000)
    return f'{words(l)} இலட்சம்' if not r else f'{words(l)} இலட்சத்து {words(r)}'

def dative(w):
    return w[:-2] + 'த்துக்கு' if w.endswith('ம்') else w + 'க்கு'

def digits(s): return ' '.join(ONES[int(c)] for c in s if c.isdigit())
LETTERS = {'A': 'ஏ', 'B': 'பி', 'C': 'சி', 'D': 'டி', 'E': 'ஈ', 'F': 'எஃப்', 'G': 'ஜி', 'H': 'எச்', 'I': 'ஐ', 'J': 'ஜே', 'K': 'கே', 'L': 'எல்', 'M': 'எம்',
           'N': 'என்', 'O': 'ஓ', 'P': 'பி', 'Q': 'க்யூ', 'R': 'ஆர்', 'S': 'எஸ்', 'T': 'டி', 'U': 'யு', 'V': 'வி', 'W': 'டபிள்யூ', 'X': 'எக்ஸ்', 'Y': 'ஒய்', 'Z': 'இசட்'}
SPOKEN = [  # Latin and symbols the voice cannot read
    ('priya@example.com', 'ப்ரியா அட் எக்ஸாம்பிள் டாட் காம்'), ('priya-pass-1', 'ப்ரியா டேஷ் பாஸ் டேஷ் ஒன்று'), ('AIFirstMart', 'ஏ ஐ ஃபர்ஸ்ட் மார்ட்'),
    ('6O', 'ஆறு, ஓ'), (' O என்ற', ' ஓ என்ற'), ('⚡', ''), ('📅', ''), ('🗓', ''), ('＋', ''), ('−', 'கழித்தல்'), ('=', 'சமம்'), (' × ', ' பெருக்கல் '),
    ('7–9', 'ஏழு முதல் ஒன்பது'), ('…', ''),
]

def spoken(t):
    t = re.sub(r'<[^>]+>', '', t)
    t = re.sub(r'(\d+) × (\d+) பிக்சல்', lambda m: f'{dative(words(m[1]))} {words(m[2])} பிக்சல்', t)
    for a, b in SPOKEN: t = t.replace(a, b)
    t = re.sub(r'(\d{5}) (\d{5})', lambda m: digits(m[1]) + ', ' + digits(m[2]), t)                       # phone numbers digit by digit
    t = re.sub(r'\b([A-Z]{2,4})-(\d+)\b', lambda m: ' '.join(LETTERS[c] for c in m[1]) + ' ' + digits(m[2]), t)  # RF-501, UTR-...
    t = re.sub(r'\b(89\d{5})\b', lambda m: digits(m[1]), t)                                               # item codes
    t = re.sub(r'₹([\d,]+)(?:\.(\d\d))?', lambda m: words(m[1].replace(',', '')) + ' ரூபாய்' + (f' {words(m[2])} பைசா' if m[2] and int(m[2]) else ''), t)
    t = re.sub(r'(\d+)\.(\d+)%', lambda m: f'{words(m[1])} புள்ளி {digits(m[2])} சதவீதம்', t)
    t = re.sub(r'(\d+)%', lambda m: f'{words(m[1])} சதவீதம்', t)
    t = re.sub(r'(\d+)\.(\d+)', lambda m: f'{words(m[1])} புள்ளி {digits(m[2])}', t)
    t = re.sub(r'\d+', lambda m: words(m[0]), t)
    t = re.sub(r'[“”"]', '', t)
    return re.sub(r'\s+', ' ', t).strip()

