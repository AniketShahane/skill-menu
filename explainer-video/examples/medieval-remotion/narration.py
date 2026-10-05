"""The narration: the single source of truth for words and timing.

Each chapter is a list of beats. A beat is one voiced clip:
  N(id, text)              narrator
  Q(id, text, who)         a medieval source, read by the second voice ("who" shows on screen)
  pad=<s>                  extra silence after the beat (for reveals and breathing room)
Visual directions live in the Remotion chapter components, keyed by beat id.
Numbers and dates are written as words so the voice and the transcript check agree.
"""


def N(id, text, pad=None):
    return {"id": id, "v": "N", "t": text, "pad": pad}


def Q(id, text, who, pad=None, show=None):
    """show: on-screen text when it differs from the spoken words (ellipses / brackets for abridged quotes)."""
    return {"id": id, "v": "Q", "t": text, "who": who, "pad": pad, "show": show}


CHAPTERS = [
    {"key": 'hook', "title": "", "beats": [
        N('h1', "Early one morning, near the end of the twelfth century, a bishop rode into an English village called Cheshunt."),
        N('h2', "A crowd surrounded him at once. They begged him to help one of their neighbours."),
        N('h3', "In the man's house, he found a sailor pinned to the ground. His head was tied to a post. Each hand was tied to a stake."),
        N('h4', "Still the man writhed. He rolled his eyes, gnashed his teeth, and stuck out his tongue."),
        N('h5', "To the bishop and the villagers, the diagnosis was obvious. A demon. The cure was an exorcism. Afterwards, we're told, the sailor lived devoutly for some years, and made a good and peaceful end.", pad=1.0),
        N('h6', "The bishop was Hugh of Lincoln, a future saint. His biographer told the story to show Hugh's healing power, courage and compassion. Because the local bishop, rather than face the possessed man, had fled."),
        Q('h7', "He galloped away as if pursued by the Furies.", "Adam of Eynsham, Hugh's biographer", show="[He] galloped away as if pursued by the Furies."),
        N('h8', "To us, this story sums up everything we expect from medieval mental health. Fear. Cruelty. Superstition. And medicine that seemed useless against serious illness.", pad=2.0),
        N('h9', "But the historian Katherine Harvey found something else. When she put down the stories of saints, and opened medieval books about healthy living, the people in them sounded strangely familiar. Their medical writers argued that a healthy mind was at the heart of a healthy life."),
        N('h10', "They worried themselves sick over work. And their doctors prescribed walks, gardens, pets, friends, and music."),
        N('h11', "So let's open this cabinet of curiosities, one drawer at a time.", pad=1.5),
    ]},
    {"key": 'humours', "title": "A Body in Balance", "beats": [
        N('c1a', "First, how did a medieval doctor think the body worked?"),
        N('c1b', "The leading theory said it held four fluids, called humours. Blood. Phlegm. Yellow bile. And black bile."),
        N('c1c', "Each humour had two qualities. Blood was hot and moist. Yellow bile, hot and dry. Black bile, cold and dry. And phlegm, cold and moist."),
        N('c1d', "Health meant keeping the four in balance. Picture your health as a single point that has to stay near its natural balance, here in the middle.", pad=1.5),
        N('c1e', "So what pushed the point around? Doctors listed six outside forces, called the non-naturals."),
        N('c1f', "Air. Food and drink. Sleep and waking. Exercise and rest. What the body holds in and lets out. And the passions: the emotions."),
        N('c1g', "That last one is the surprise. Feelings were treated as a force on the body, as real as a bad meal or a sleepless night.", pad=1.5),
        N('c1h', "Health guides called regimens were hugely popular in late medieval Europe. And again and again they warned: control your feelings."),
        Q('c1i', "It is necessary that a man that wishes to preserve his health will not become angry, nor irritated, nor worried, as much as possible, because once he does so he greatly harms his body.", "Juan de Aviñón, physician of Seville, fourteenth century"),
        N('c1j', "In Bavaria, the physician Arnold von Bamberg warned that unruly feelings would knock over your eating, your exercise, and your sleep. And then you would need a doctor."),
        N('c1k', "People believed it. In thirteen ninety-five, an Italian merchant named Niccolaio Martini fell ill with a high fever. He told his friend Margherita Datini that he had fallen ill after getting very upset about the result of an election.", pad=1.0),
        N('c1l', "So which feelings were the most dangerous?"),
    ]},
    {"key": 'kill', "title": "Feelings That Could Kill", "beats": [
        N('c2a', "Some emotions could strike like lightning. Fear was especially dangerous."),
        N('c2b', "One Good Friday, Alice, the daughter of a clerk in Essex, was milking sheep when she saw a ghost."),
        N('c2c', "Her terror, the story says, froze the blood around her heart.", pad=1.5),
        N('c2d', "It so confused her senses that, in a temporary fit of mania, she threw herself into a fire."),
        N('c2e', "Her cure, the monks recorded, was a miracle, worked by a holy relic, said to be the hand of Saint James, kept at Reading Abbey."),
        N('c2f', "Anger worked the other way: it warmed the body and dried it out. A serious temper tantrum could kill outright. And chronic anger, one German health guide warned, would"),
        Q('c2g', "consume the body swiftly, so that the man meets a short end.", "A German health guide, mid fifteenth century", show="…consume the body swiftly, so that the man meets a short end."),
        N('c2h', "One chronicler even linked a king's death to a family quarrel. Henry the First of England was furious over a dispute with his daughter."),
        N('c2h2', "Some said that anger caused the chill in his bowels that later killed him.", pad=1.0),
        N('c2i', "Fear and anger came and went quickly. But what about strain that never lets up?"),
    ]},
    {"key": 'bow', "title": "The Bent Bow", "beats": [
        N('c3a', "One medieval image compares the mind to a bow."),
        N('c3b', "A bow is strong. But keep it bent all the time, and it cannot survive the strain. Endless quarrels at home, the writer warned, could shorten a person's years.", pad=1.5),
        N('c3c', "Like us, they knew too much responsibility could make you ill. And they thought powerful men were especially at risk."),
        N('c3d', "Around the year twelve hundred, an English writer, Daniel of Beccles, said that a master of a household lives like a toiling ant."),
        Q('c3e', "His pressing worries gnaw at his gut and burden his shoulders.", "Daniel of Beccles, around twelve hundred"),
        N('c3f', "The French knight Boucicaut kept a packed daily schedule. His biographer suggested he slow down, or he would surely fall ill."),
        Q('c3g', "Those who love him ought rather to advise him to be a little less conscientious, and to take at least some time for repose and recreation.", "Boucicaut's biographer", show="Those who love him … ought rather to advise him to be a little less conscientious, and to take at least some time for repose and recreation."),
        N('c3h', "Even monks felt crushed. At Rievaulx Abbey in Yorkshire, an elderly monk named Matthew was in charge of the singing."),
        N('c3i', "He wrote to a friend that the job was making him ill."),
        Q('c3j', "From the bottom of my feet to the very top of my head, there is no peace in my bones.", "Matthew of Rievaulx, thirteenth century", show="From the bottom of my feet to the very top of my head … there is no peace in my bones."),
        N('c3k', "He had stomach pains and exhaustion, and he was sure the work would kill him. We don't know what became of him."),
        N('c3l', "At Saint Albans, a monk named Alexander de Langley had a breakdown blamed on overwork: fits of raving, and wonderful great airs. So his duties were lightened. He started studying too much instead. And that, in the end, robbed him of his wits.", pad=1.0),
        N('c3m', "Overwork was one danger. The other came from inside: a mind that would not stop worrying."),
    ]},
    {"key": 'worry', "title": "The Worrier of Prato", "beats": [
        N('c4a', "Meet Francesco Datini, a merchant from Prato, in Tuscany, born in the thirteen thirties."),
        Q('c4b', "Fate has so willed that, from the day of my birth, I should never know a whole happy day.", "Francesco Datini"),
        N('c4c', "The first wave of the Black Death had orphaned him as a boy. And the plague kept coming back to Italy all his life."),
        N('c4d', "He worried about almost everything, especially the plague and his business. In thirteen ninety-five, he wrote to his wife, Margherita, about a dream."),
        Q('c4e', "I dreamed last night of a house which had fallen to pieces, and all my household were inside it.", "Francesco Datini, to Margherita", pad=1.0),
        N('c4f', "The dream set him thinking about a ship he hadn't heard from in more than two months."),
        Q('c4g', "So vexed by many matters, it is a wonder I am not out of my mind.", "Francesco Datini", show="[I am] so vexed by many matters, it is a wonder I am not out of my mind."),
        N('c4h', "Margherita, of course, worried about him."),
        Q('c4i', "Why dwell on it so much that you harm both body and soul?", "Margherita Datini"),
        Q('c4j', "What worries me most is that you seem to have been extremely melancholy, though you refuse to tell me anything.", "Margherita Datini", pad=1.0),
        N('c4k', "Melancholy, from the Greek for black bile, was their word for something close to our depression: a low mood that wouldn't lift, and no interest in daily life."),
        N('c4l', "Some sufferers even saw terrible black shapes before their eyes, like dark monks, or demons."),
        N('c4m', "King Duarte of Portugal wrote movingly about his lifelong struggle with a melancholic humour. It began when he governed the country as regent, during a major outbreak of plague."),
        N('c4n', "And monks were prone to acedia, a deadly listlessness of the spirit. Long silences, endless services, too much entertaining, and bad news about friends could leave them"),
        Q('c4n2', "so much disturbed in spirit, that they move about among their fellows as though they were half-dead.", "A medieval description of acedia", pad=1.5, show="…so much disturbed in spirit, that they move about among their fellows as though they were half-dead."),
        N('c4o', "So if you were melancholy in the Middle Ages, what would your doctor do?"),
    ]},
    {"key": 'chest', "title": "The Medicine Chest", "beats": [
        N('c5a0', "There were no psychiatric drugs, and no therapists. But doctors were more and more interested in emotional health, and in the link between mind and body."),
        N('c5a', "Doctors started with the body. Melancholy usually meant too much black bile, which filled the brain with a kind of mist, and clouded clear thinking."),
        N('c5b', "So: purge the excess, and warm the body back up. Syrups of cinnamon and liquorice. A massage with warm oils."),
        N('c5c', "Like us, they also believed some substances could lift the mood. Saffron was said to provoke joy."),
        N('c5d', "Perhaps too well. A Welsh recipe collection from around fourteen hundred warns you not to eat too much of it."),
        Q('c5e', "In case you die of happiness.", "A Welsh recipe collection, around fourteen hundred", pad=1.5),
        N('c5f', "Oregano and fennel were credited with similar powers. And a melancholic might be told to eat ostrich liver."),
        N('c5g', "The abbess Hildegard of Bingen trusted precious stones."),
        Q('c5h', "If you are oppressed with sadness, look at an onyx intently, then place it in your mouth. The oppression of your mind will cease.", "Hildegard of Bingen"),
        N('c5i', "A sapphire in the mouth, she added, or holding and gazing at a beryl, could calm anger.", pad=1.0),
        N('c5j', "But the remedies were meant to work best alongside something else: a change in how you lived."),
    ]},
    {"key": 'joy', "title": "A Prescription for Joy", "beats": [
        N('c6a', "In the twelve hundreds, the doctor Taddeo Alderotti treated Obizzo, lord of Ferrara, who had suffered melancholy and sleeplessness for more than two years."),
        N('c6b', "Here is part of the prescription."),
        Q('c6b2', "Taking walks. Seeing things that are beautiful and delightful to him. Hearing songs and instruments that he likes.", "Taddeo Alderotti's prescription"),
        N('c6c', "And one more: being told about, and promised, great yields from profitable markets.", pad=1.0),
        N('c6d', "Doctors today sometimes do something similar, called social prescribing. But why would joy be medicine?"),
        N('c6e', "Go back to the balance. Almost every strong emotion was thought to dry the body out."),
        N('c6f', "Joy was the exception. Joy moistened it.", pad=3.0),
        N('c6g', "Joy was said to purify the blood, sharpen the wits, raise your energy, and give you a healthy complexion. It could even make you more attractive."),
        Q('c6h', "A sorrowful heart often brings people to the end, but the joyful mind always makes life's age blossom.", "A German verse health guide, mid fifteenth century", pad=1.0),
        N('c6i', "So doctors urged everyone to do things that cheered them up. Start with friends."),
        N('c6j', "Margherita once wrote to Francesco's dear friend, the lawyer Lapo Mazzei, with a request."),
        Q('c6k', "Pray tell Francesco some of your jests, that they may bring solace to his melancholy.", "Margherita Datini"),
        N('c6l', "Then there were pets. Cats, dogs and birds were favourites."),
        N('c6m', "Robert de Insula, a bishop of Durham, kept monkeys to ease the burden of his worries. And King Alfonso the Tenth of Castile had a ferret that he loved dearly, carried with him, and cared for tenderly.", pad=1.0),
        N('c6n', "Friends and pets lifted the heart. So did books, music, and fresh air."),
    ]},
    {"key": 'air', "title": "Songs, Stories and Fresh Air", "beats": [
        N('c7a', "Reading counted as healthy too, as long as you chose cheerful books. One ailing friar was told to stop reading horrible stories of martyrdom and death."),
        N('c7b', "Harvey has a soft spot for gloomy books, which her sister calls her sad-people books. She admits this advice makes her feel somewhat attacked.", pad=1.0),
        N('c7c', "Music was medicine. In the thirteen nineties, when a prominent lawyer's son lay dying in Bologna, the city government sent him a master musician and storyteller, explaining why."),
        Q('c7d', "Constant worrying deprives individuals of their vital breath, and the best remedy for this is to listen to stories and songs as often as possible.", "The government of Bologna, thirteen nineties"),
        N('c7e', "Around the same time, the city granted safe passage to a medical practitioner named Sergio of Polo, who used song to calm minds, and to restore weak hearts to joy."),
        N('c7f', "And get out of the house. Depressed monks were sent on long walks. Rich monasteries kept country houses, where exhausted monks could enjoy a change of air and surroundings."),
        N('c7g', "People loved gardens for what they gave the senses: green grass, sweet flowers, the sound of running water."),
        N('c7h', "Datini built a pleasure garden at his house in Prato, full of oranges, roses and violets. Later he called it a great piece of folly, since a farm would have made more money. But he clearly loved it."),
        N('c7i', "The scholar Platina enjoyed weeding and pruning. Gardening, he believed, relaxed the mind while it exercised the body."),
        N('c7j', "Some guides suggested indoor exercise, like lifting weights or climbing stairs. But most experts thought the best exercise was outdoors. The London medical writer John Mirfield explained why."),
        Q('c7k', "For then a man is exposed to wholesome air, and he rejoices in gazing far and near, and upon the sky, the sea, and the green landscape.", "John Mirfield, London", pad=1.5, show="For then a man is exposed to wholesome air, and he rejoices in gazing far and near, and upon the sky, the sea, and the green landscape …"),
        N('c7l', "All of that, Mirfield said, moves a man to praise his Creator. One walk: good for the body, the mind, and the soul."),
    ]},
    {"key": 'soul', "title": "Body, Mind and Soul", "beats": [
        N('c8a', "For medieval people, body, mind and soul were bound together. Devotion lifted the mood, and a better mood meant better health. So medical writers counted piety as healthy."),
        N('c8b', "One thirteenth-century health guide from southern France listed prayer among the things you must do with joy, to lengthen your life."),
        N('c8c', "And the monk and poet John Lydgate's bestselling poem, the Dietary, put regular prayer right beside its warnings to keep your emotions in check."),
        N('c8d', "Faith carried many people through. King Duarte believed God had sent his illness. He did see doctors. He worked less, and slept more. But the greatest relief came from devotion: giving to the poor, confession, and communion."),
        N('c8e', "In Florence, the wool merchant Giovanni Morelli lost his eldest son, and was tormented by grief and guilt."),
        N('c8f', "On the first anniversary of the boy's death, terrible dreams left him so desperate that he came close to ending his own life. But his faith, Harvey writes, carried him through.", pad=2.0),
    ]},
    {"key": 'crisis', "title": "When the Mind Mattered Most", "beats": [
        N('c9a', "Sometimes caring for your mind seemed a matter of life and death. When the Black Death struck, many believed that a gloomy mind made you easier prey."),
        N('c9b', "The French physician Chalin de Vivario said many people caught the plague through fears and imaginings, stirred up by funeral bells and morbid gossip."),
        N('c9c', "So people were urged to keep their spirits up, much as we were during the COVID lockdowns."),
        N('c9d', "The Bologna professor Tommaso del Garbo had a plan for this time of pestilence: cheerful, carefree company, rest in the garden, and music and stories.", pad=1.0),
        N('c9e', "Even outside plague years, some people needed special care. Pregnant women were warned that anger, deep sadness, fear, or a sudden shock like a clap of thunder, could cause them to lose the baby."),
        N('c9f', "Women who had lost several pregnancies were sometimes treated for melancholy. In Padua, a woman named Elizabeth was told her losses probably came from too much anger or sorrow, which drew the body's spirits away from the womb, and left it too cold."),
        N('c9g', "Her doctors seemed to see her grief as a cause of the losses, not only a result. Today we know that stress, sadness or a sudden fright do not cause miscarriage, and that a loss is not the mother's fault. The medieval advice was gentle, even if the theory behind it put a heavy burden on women."),
        Q('c9h', "Live in friendship with God, and be merry.", "Advice to mothers-to-be", pad=1.0),
        N('c9i', "They also knew old age could cloud the mind. The poet Samuel ibn Naghrillah wrote that a man in his nineties would not know his left from his right."),
        N('c9j', "The future Pope Innocent the Third complained that old men were moody and argumentative, always praising the good old days, and hating the present."),
        N('c9k', "In Exeter, the aged Bishop Edmund Lacey had to hand over most of his duties. The mayor said the old man understood the matter no better than the figure woven into the wall-hanging.", pad=1.0),
        N('c9l', "In fourteen eighty-nine, Gabriele Zerbi wrote a whole book on caring for the old. Old people grew forgetful, he explained, because cold and dryness ruled their bodies. Their spirits turned thick and sluggish, leaving them dull, fanciful, and low."),
        N('c9m', "His remedy was pleasure, which lifted the mood and eased pain. Music, he said, works on the mind as medicine works on the body. Conversation and stories helped too. And to keep the mind exercised: maths problems."),
        Q('c9n', "The exercise of the mind increases its strength to such an extent that many people are cured of their ills through sheer delight.", "Gabriele Zerbi, fourteen eighty-nine"),
        N('c9o', "Many old people kept working, most out of necessity, but some because it did them good. The poet Petrarch ignored his friends' advice to slow down. Study was his joy."),
        Q('c9p', "When I begin to rest and grow slow, I shall soon cease even to live.", "Francesco Petrarch", pad=2.0),
    ]},
    {"key": 'lessons', "title": "What We Keep", "beats": [
        N('c10a', "More than six centuries after Petrarch, these troubles are still with us. Every year, mental illness touches millions of lives, and hundreds of thousands are lost to it. It strains our health services, and our economies."),
        N('c10b', "Everyone affected deserves the best possible care, but for many people it costs too much. And some critics worry that we lean too heavily on psychiatric drugs, and on diagnostic labels."),
        N('c10c', "So what can we take from the cabinet? Not everything. Let's not revive exorcism, saffron overdoses, or ostrich liver.", pad=1.0),
        N('c10d', "But Harvey suggests three things worth keeping."),
        N('c10e', "One: prevention. As individuals and as societies, build the friendships and habits that make us resilient, before the bow is bent too far."),
        N('c10f', "Two: see it whole. Mental health isn't a separate problem. It's part of a healthy life, like food and sleep."),
        N('c10g', "And three, perhaps the most important. Anxiety and depression are not a modern fad.", pad=1.0),
        N('c10h', "A merchant dreamed his house had fallen, and fretted over a ship with no news. A king fought a lifelong melancholy. An old monk found no peace in his bones."),
        N('c10i', "These are perennial human troubles. And for as long as people have suffered them, other people have tried to help: with a walk, a song, a garden, a friend.", pad=3.0),
    ]},
    {"key": "credits", "title": "", "beats": [], "hold": 14},
]

VOICES = {
    "N": {
        "voice": "Charon",
        "model": "gemini-3.1-flash-tts-preview",
        "style": "a warm, thoughtful storyteller narrating a history documentary to one friend: unhurried, clear, gently curious, with natural pauses at commas and full stops"
    },
    "Q": {
        "voice": "Gacrux",
        "model": "gemini-2.5-pro-preview-tts",
        "style": "reading aloud from an old manuscript: slow, hushed, intimate and slightly weary, as if the writer were speaking across six centuries"
    }
}
