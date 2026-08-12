// T002: Curated backfill catalog for the `db:seed:local` dev tooling script (see
// scripts/seed-books.mjs and specs/003-book-backfill-seed/data-model.md).
//
// A fixed, hand-picked list of real, well-known books spanning multiple genres (classic
// literature, sci-fi, fantasy, mystery/thriller, non-fiction, memoir, YA, and more). Each
// entry's `quantityTotal` is a fixed value (not randomized at seed time) so that seeding the
// same title always produces the same data — see the "Quantity variation strategy" decision in
// specs/003-book-backfill-seed/research.md for why.
//
// Invariants relied on by scripts/seed-books.mjs (see data-model.md):
//   - At least 30 entries.
//   - `title` values are unique (exact match is how idempotency/existence is checked).
//   - `quantityTotal` is an integer >= 1, with more than one distinct value used across the
//     list (varied, not uniform).

/**
 * @typedef {Object} CatalogEntry
 * @property {string} title
 * @property {string} author
 * @property {string | null} isbn
 * @property {string | null} description
 * @property {number} quantityTotal
 */

/** @type {CatalogEntry[]} */
const BOOKS = [
  { title: "To Kill a Mockingbird", author: "Harper Lee", isbn: null, description: "A young girl in the Depression-era South watches her father defend a Black man falsely accused of rape.", quantityTotal: 8 },
  { title: "1984", author: "George Orwell", isbn: null, description: "A dystopian vision of a totalitarian future ruled by surveillance and propaganda.", quantityTotal: 10 },
  { title: "Pride and Prejudice", author: "Jane Austen", isbn: null, description: "A witty comedy of manners about love, class, and first impressions in Georgian England.", quantityTotal: 6 },
  { title: "The Great Gatsby", author: "F. Scott Fitzgerald", isbn: null, description: "A mysterious millionaire's obsession with a lost love unravels amid Jazz Age excess.", quantityTotal: 7 },
  { title: "One Hundred Years of Solitude", author: "Gabriel García Márquez", isbn: null, description: "The multigenerational saga of the Buendía family in the mythical town of Macondo.", quantityTotal: 4 },
  { title: "The Catcher in the Rye", author: "J.D. Salinger", isbn: null, description: "A disaffected teenager wanders New York City after being expelled from prep school.", quantityTotal: 5 },
  { title: "Brave New World", author: "Aldous Huxley", isbn: null, description: "A genetically engineered future society trades freedom for stability and pleasure.", quantityTotal: 9 },
  { title: "The Hobbit", author: "J.R.R. Tolkien", isbn: null, description: "A reluctant hobbit is swept into an epic quest to reclaim a dwarven kingdom from a dragon.", quantityTotal: 12 },
  { title: "The Fellowship of the Ring", author: "J.R.R. Tolkien", isbn: null, description: "A hobbit and his companions set out to destroy a ring of immense power.", quantityTotal: 11 },
  { title: "Harry Potter and the Sorcerer's Stone", author: "J.K. Rowling", isbn: null, description: "An orphaned boy discovers he is a wizard and begins his education at Hogwarts.", quantityTotal: 12 },
  { title: "The Da Vinci Code", author: "Dan Brown", isbn: null, description: "A symbologist races to solve a murder mystery hidden in Leonardo da Vinci's art.", quantityTotal: 6 },
  { title: "Gone Girl", author: "Gillian Flynn", isbn: null, description: "A wife's disappearance turns her husband into the prime suspect in a media firestorm.", quantityTotal: 5 },
  { title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson", isbn: null, description: "A journalist and a hacker investigate a decades-old disappearance in Sweden.", quantityTotal: 4 },
  { title: "And Then There Were None", author: "Agatha Christie", isbn: null, description: "Ten strangers are lured to an island and killed one by one.", quantityTotal: 7 },
  { title: "Murder on the Orient Express", author: "Agatha Christie", isbn: null, description: "Detective Hercule Poirot investigates a murder aboard a snowbound train.", quantityTotal: 6 },
  { title: "Dune", author: "Frank Herbert", isbn: null, description: "A noble family's fall sparks a young man's rise as messiah on a desert planet.", quantityTotal: 9 },
  { title: "Ender's Game", author: "Orson Scott Card", isbn: null, description: "A gifted child is trained to command Earth's fleet against an alien threat.", quantityTotal: 6 },
  { title: "Fahrenheit 451", author: "Ray Bradbury", isbn: null, description: "In a future where books are outlawed, a fireman begins to question his role burning them.", quantityTotal: 8 },
  { title: "Slaughterhouse-Five", author: "Kurt Vonnegut", isbn: null, description: "A soldier becomes unstuck in time after surviving the firebombing of Dresden.", quantityTotal: 3 },
  { title: "The Road", author: "Cormac McCarthy", isbn: null, description: "A father and son journey across a devastated post-apocalyptic America.", quantityTotal: 3 },
  { title: "Beloved", author: "Toni Morrison", isbn: null, description: "A former slave is haunted by the ghost of the daughter she lost.", quantityTotal: 4 },
  { title: "The Kite Runner", author: "Khaled Hosseini", isbn: null, description: "A man returns to Taliban-era Afghanistan to atone for a childhood betrayal.", quantityTotal: 7 },
  { title: "Life of Pi", author: "Yann Martel", isbn: null, description: "A shipwrecked boy survives 227 days on a lifeboat with a Bengal tiger.", quantityTotal: 5 },
  { title: "The Alchemist", author: "Paulo Coelho", isbn: null, description: "A shepherd travels from Spain to Egypt in search of a treasure and his destiny.", quantityTotal: 10 },
  { title: "Where the Crawdads Sing", author: "Delia Owens", isbn: null, description: "A girl raised alone in the marshes becomes a murder suspect in coastal North Carolina.", quantityTotal: 8 },
  { title: "Educated", author: "Tara Westover", isbn: null, description: "A woman raised off-grid in rural Idaho fights her way to a Cambridge doctorate.", quantityTotal: 6 },
  { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", isbn: null, description: "A sweeping account of how Homo sapiens came to dominate the planet.", quantityTotal: 9 },
  { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", isbn: null, description: "A Nobel laureate explains the two systems that drive the way we think.", quantityTotal: 4 },
  { title: "The Immortal Life of Henrietta Lacks", author: "Rebecca Skloot", isbn: null, description: "The story behind the cells that revolutionized medicine, taken without her knowledge.", quantityTotal: 3 },
  { title: "Atomic Habits", author: "James Clear", isbn: null, description: "A practical guide to building good habits and breaking bad ones.", quantityTotal: 12 },
  { title: "Becoming", author: "Michelle Obama", isbn: null, description: "The former First Lady's memoir of her journey from Chicago's South Side to the White House.", quantityTotal: 7 },
  { title: "A Brief History of Time", author: "Stephen Hawking", isbn: null, description: "An accessible tour of cosmology, black holes, and the origin of the universe.", quantityTotal: 5 },
  { title: "The Diary of a Young Girl", author: "Anne Frank", isbn: null, description: "A teenager's diary chronicling two years in hiding during the Nazi occupation.", quantityTotal: 6 },
  { title: "Frankenstein", author: "Mary Shelley", isbn: null, description: "A scientist's creation turns monstrous after being abandoned by its maker.", quantityTotal: 4 },
  { title: "Dracula", author: "Bram Stoker", isbn: null, description: "A Transylvanian count's arrival in England unleashes a battle against ancient evil.", quantityTotal: 5 },
  { title: "The Hunger Games", author: "Suzanne Collins", isbn: null, description: "A girl volunteers to fight to the death in a televised competition to save her sister.", quantityTotal: 11 },
];

export default BOOKS;
