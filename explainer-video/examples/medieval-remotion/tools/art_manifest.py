"""Every generated illustration: name -> (aspect, subject). Run: uv run python tools/gen_all.py [names...]"""

STYLE = ("Medieval manuscript illustration in the style of a fourteenth-century illuminated manuscript: "
         "confident brown iron-gall ink outlines, flat mineral-pigment washes (vermilion, lapis blue, verdigris "
         "green, ochre), small touches of burnished gold leaf. Plain, flat, evenly toned warm cream vellum "
         "background, clean, with no stains and nothing else in the background. No text, no lettering, no "
         "border, no frame. The subject is centered with a generous empty margin all around. No halos. The drawing is not inside any frame, panel or box: it sits directly on the open page.")

ART = {
    # hook
    "village": ("16:9", "Large, filling most of the image: a small English village at dawn: thatched cottages, a stone church tower, a lane. A bishop in a mitre rides in on a white horse, and a small crowd of villagers in tunics gathers around him, pointing toward one cottage."),
    "sailor": ("16:9", "Inside a humble cottage, a man in a sailor's tunic lies on the earthen floor; his head is tied with a rope to a wooden post, and each wrist is tied to a wooden stake in the ground. He is writhing. A bishop with a crozier stands at the doorway with worried villagers behind him. Restrained, non-graphic, sympathetic."),
    "demon": ("1:1", "A small mischievous medieval drollery demon with bat wings, horns, and a curling tail, crouching."),
    "cat": ("1:1", "A tabby cat sitting contentedly, tail curled around its paws."),
    "lute": ("1:1", "A medieval lute with a rounded back and a bent pegbox, shown at a slight angle."),
    "rose": ("1:1", "A single red rose stem with leaves and a bud, like a botanical herbal page."),
    "walker": ("1:1", "A pilgrim walking with a staff along a little grassy path, seen from the side, mid-stride, cheerful."),
    "friends": ("1:1", "Two friends in medieval dress sitting side by side on a bench, laughing together, one with a hand on the other's shoulder."),
    # humours
    "books": ("1:1", "A neat stack of five medieval bound books with leather covers, brass clasps and coloured page edges."),
    "fever": ("1:1", "A medieval Italian merchant lying ill in a curtained bed, flushed with fever, a friend at the bedside listening to him."),
    # kill
    "alice": ("16:9", "Large, filling most of the image: a young peasant girl in a hood milking a sheep in a field at dusk; behind a tree, a pale translucent ghost in a shroud appears, and she startles in terror."),
    "reliquary": ("1:1", "A gilded medieval hand reliquary: an upright golden forearm and hand, set with jewels, raised in blessing."),
    "crown": ("1:1", "A medieval king's golden crown with fleurons and gems, on its own."),
    # bow
    "ant": ("1:1", "A single ant, drawn large like a bestiary illustration, straining to haul a heavy sack and bundle much larger than itself."),
    "abbey": ("16:9", "Large, filling most of the image: a Cistercian abbey in the thirteenth century, intact, with a tall church and cloister, nestled in a green wooded valley beside a river, hills behind."),
    "monk": ("1:1", "An elderly, exhausted monk in a white Cistercian habit, holding his stomach, leaning on a lectern with a large open choir book."),
    "bookpile": ("1:1", "A precariously tall, tottering pile of many old books and scrolls."),
    # worry
    "merchant": ("1:1", "A worried fourteenth-century Tuscan merchant at a desk covered in ledgers, letters and coins, resting his head on his hand."),
    "house": ("1:1", "A tall narrow Tuscan townhouse of stone with a tiled roof, arched windows and a wooden door, drawn front-on."),
    "ship": ("16:9", "Large, filling most of the image: a medieval merchant cog ship with one square sail on a rough, wave-tossed sea, far from land, under a darkening sky drawn in ink."),
    "letter": ("1:1", "A folded medieval letter tied with string and closed with a red wax seal."),
    "shadows": ("1:1", "Ominous, faceless dark ink silhouettes of hooded figures and a horned demon, drawn only as solid black shapes, looming."),
    "monks": ("16:9", "Large, filling most of the width: a slow procession of grey-robed monks with bowed heads moving through a cloister, listless and weary, as though half dead."),
    # chest
    "head": ("1:1", "A man's head and shoulders in side profile facing right, eyes downcast, melancholy, simple clean outline with soft wash."),
    "spices": ("1:1", "Cinnamon bark quills and a few liquorice roots tied with string, beside a small glass bottle of amber syrup."),
    "oil": ("1:1", "A small round glass flask of golden warm oil with a stopper, gently steaming."),
    "herbs": ("1:1", "A sprig of oregano and a feathery fennel plant with yellow umbel flowers, side by side like a herbal page."),
    "ostrich": ("1:1", "An ostrich drawn as in a medieval bestiary, slightly comical, long neck, holding a horseshoe in its beak."),
    "gems": ("1:1", "Three polished gemstones: a black-and-white banded onyx, a pale sea-green beryl, and a deep blue sapphire, arranged in a row."),
    # joy
    "coins": ("1:1", "A spilling leather purse of gold florins and a set of merchant's balance scales."),
    "monkey": ("1:1", "A small monkey sitting playfully, holding a fruit, wearing a tiny collar, as in a medieval drollery."),
    "ferret": ("1:1", "A sleek white ferret curled affectionately, looking up, wearing a small red collar."),
    "dog": ("1:1", "A loyal medieval hound lying down, looking up adoringly."),
    "bird": ("1:1", "A small songbird, a goldfinch, perched on a twig and singing."),
    "flower": ("1:1", "A single flower in full bloom with fresh green leaves, opening joyfully, like a herbal illustration."),
    # air
    "sadbook": ("1:1", "A drawing of an open medieval book seen from above; its pages show a grim little martyrdom scene and a skull. The book itself is drawn in ink and wash like everything else, not photographed."),
    "happybook": ("1:1", "A drawing of an open medieval book seen from above; its pages are full of flowers, birds and little dancing figures. The book itself is drawn in ink and wash, not photographed."),
    "garden": ("16:9", "Large, filling most of the image, seen at a slight bird's-eye angle: a walled medieval pleasure garden: green lawn, a stone fountain with running water, orange trees with oranges, rose bushes, violets, a turf bench."),
    "pruning": ("1:1", "A scholar in a red cap happily pruning a small fruit tree with a curved pruning knife, a basket of weeds at his feet."),
    "landscape": ("21:9", "A wide panoramic landscape: a big open sky with a few clouds, rolling green hills and fields, and the sea shining on the right, with a tiny walking figure on a path."),
    # soul
    "candle": ("1:1", "A single lit candle in a simple iron candlestick, with a warm steady flame."),
    # crisis
    "bell": ("1:1", "A large church bell hanging from a wooden beam, swinging, with its rope."),
    "gossip": ("1:1", "Two medieval women whispering behind their hands, one looking alarmed."),
    "thunder": ("1:1", "A dark storm cloud with a jagged golden lightning bolt."),
    "cradle": ("1:1", "An empty wooden medieval rocking cradle with a soft blanket."),
    "oldman": ("1:1", "A very old bearded man with a walking stick, looking confused, gesturing left and right."),
    "tapestry": ("1:1", "A drawing of a small wall-hanging tapestry showing a single stiff standing figure of a courtier, woven texture, hanging from a rod."),
    "scholar": ("1:1", "An elderly poet-scholar in a red robe writing joyfully at a desk with a pile of books and a laurel wreath on his head."),
    "hourglass": ("1:1", "A wooden and glass hourglass with sand running."),
    # cabinet
    "cabinet": ("16:9", "An ornate carved walnut cabinet of curiosities, seen exactly front-on (orthographic, no perspective), with gilded carvings at the top. Its front is a precise regular grid of 5 columns by 2 rows of identical, empty, square open compartments lined with plain cream paper. The cabinet fills most of the image."),
}
