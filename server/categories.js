'use strict';

/**
 * Category catalogue. Each entry needs a stable `id` (referenced by the client),
 * some presentation metadata, and at least 4 characters so a full room can be dealt
 * unique picks.
 */
const CATEGORIES = [
  {
    id: 'celebrities',
    name: 'Celebrities',
    emoji: '🌟',
    blurb: 'Red carpets, tabloids and household names.',
    accent: '#f5a524',
    characters: [
      'Beyoncé', 'Dwayne Johnson', 'Taylor Swift', 'Keanu Reeves', 'Oprah Winfrey',
      'Leonardo DiCaprio', 'Rihanna', 'Tom Cruise', 'Zendaya', 'Brad Pitt',
      'Lady Gaga', 'Will Smith', 'Emma Watson', 'Snoop Dogg', 'Jennifer Lopez',
      'Ryan Reynolds', 'Ariana Grande', 'Morgan Freeman', 'Kim Kardashian', 'Elon Musk',
      'Shah Rukh Khan', 'Priyanka Chopra', 'Jackie Chan', 'Scarlett Johansson', 'Ed Sheeran',
      'Gordon Ramsay', 'Adele', 'Robert Downey Jr.', 'Billie Eilish', 'Jim Carrey'
    ]
  },
  {
    id: 'history',
    name: 'Historical Figures',
    emoji: '🏛️',
    blurb: 'People who already made it into the textbooks.',
    accent: '#c08457',
    characters: [
      'Cleopatra', 'Albert Einstein', 'Napoleon Bonaparte', 'Marie Curie', 'Julius Caesar',
      'Mahatma Gandhi', 'Leonardo da Vinci', 'Joan of Arc', 'Abraham Lincoln', 'Genghis Khan',
      'Nelson Mandela', 'Queen Victoria', 'Isaac Newton', 'Amelia Earhart', 'Winston Churchill',
      'Christopher Columbus', 'Rosa Parks', 'Alexander the Great', 'Florence Nightingale', 'Galileo Galilei',
      'Martin Luther King Jr.', 'Anne Frank', 'Nikola Tesla', 'Catherine the Great', 'Confucius',
      'Harriet Tubman', 'Charles Darwin', 'Tutankhamun', 'Wolfgang Amadeus Mozart', 'Ada Lovelace'
    ]
  },
  {
    id: 'movies',
    name: 'Movie Characters',
    emoji: '🎬',
    blurb: 'Icons of the silver screen.',
    accent: '#7c5cff',
    characters: [
      'Darth Vader', 'Forrest Gump', 'Hermione Granger', 'James Bond', 'Indiana Jones',
      'Jack Sparrow', 'The Joker', 'Marty McFly', 'Ellen Ripley', 'Gollum',
      'Rocky Balboa', 'Neo', 'Katniss Everdeen', 'Hannibal Lecter', 'E.T.',
      'Willy Wonka', 'Maximus', 'Frodo Baggins', 'Tony Montana', 'Elle Woods',
      'Shrek', 'Vito Corleone', 'Jack Dawson', 'Yoda', 'Mary Poppins',
      'John Wick', 'Dorothy Gale', 'Terminator', 'Buzz Lightyear', 'Woody'
    ]
  },
  {
    id: 'superheroes',
    name: 'Superheroes & Villains',
    emoji: '🦸',
    blurb: 'Capes, powers and questionable secret identities.',
    accent: '#ff4d6d',
    characters: [
      'Spider-Man', 'Batman', 'Wonder Woman', 'Iron Man', 'Superman',
      'Black Panther', 'Thor', 'Deadpool', 'Captain America', 'Harley Quinn',
      'Thanos', 'Doctor Strange', 'The Hulk', 'Loki', 'Black Widow',
      'Wolverine', 'Catwoman', 'Green Lantern', 'Magneto', 'Groot',
      'Aquaman', 'Scarlet Witch', 'The Flash', 'Venom', 'Ant-Man',
      'Captain Marvel', 'Lex Luthor', 'Storm', 'Star-Lord', 'The Penguin'
    ]
  },
  {
    id: 'athletes',
    name: 'Athletes',
    emoji: '🏆',
    blurb: 'Legends of the pitch, court, track and ring.',
    accent: '#2dd4a7',
    characters: [
      'Lionel Messi', 'Serena Williams', 'Cristiano Ronaldo', 'Michael Jordan', 'Usain Bolt',
      'Sachin Tendulkar', 'Muhammad Ali', 'LeBron James', 'Roger Federer', 'Simone Biles',
      'Virat Kohli', 'Tiger Woods', 'Lewis Hamilton', 'Maria Sharapova', 'Tom Brady',
      'Pelé', 'Kobe Bryant', 'Rafael Nadal', 'Diego Maradona', 'Novak Djokovic',
      'Shaquille O’Neal', 'Mike Tyson', 'Neymar Jr.', 'Megan Rapinoe', 'David Beckham',
      'Kylian Mbappé', 'Michael Phelps', 'Stephen Curry', 'MS Dhoni', 'Ronda Rousey'
    ]
  },
  {
    id: 'musicians',
    name: 'Musicians',
    emoji: '🎸',
    blurb: 'Chart toppers, rock gods and one-name wonders.',
    accent: '#38bdf8',
    characters: [
      'Michael Jackson', 'Freddie Mercury', 'Madonna', 'Elvis Presley', 'Bob Marley',
      'Drake', 'Dolly Parton', 'Kurt Cobain', 'Prince', 'Eminem',
      'Amy Winehouse', 'David Bowie', 'Bruno Mars', 'Whitney Houston', 'Jimi Hendrix',
      'Kanye West', 'Johnny Cash', 'A. R. Rahman', 'Shakira', 'Frank Sinatra',
      'Bad Bunny', 'Stevie Wonder', 'Dua Lipa', 'Elton John', 'Nicki Minaj',
      'John Lennon', 'Post Malone', 'Aretha Franklin', 'Harry Styles', 'Bob Dylan'
    ]
  },
  {
    id: 'cartoons',
    name: 'Cartoon Characters',
    emoji: '📺',
    blurb: 'Saturday mornings, animated and unhinged.',
    accent: '#fbbf24',
    characters: [
      'SpongeBob SquarePants', 'Bugs Bunny', 'Homer Simpson', 'Scooby-Doo', 'Mickey Mouse',
      'Pikachu', 'Rick Sanchez', 'Tom Cat', 'Bart Simpson', 'Patrick Star',
      'Popeye', 'Goku', 'Peppa Pig', 'Eric Cartman', 'Doraemon',
      'Naruto Uzumaki', 'Finn the Human', 'Velma Dinkley', 'Johnny Bravo', 'Dexter',
      'Fred Flintstone', 'Winnie the Pooh', 'Bender', 'Courage the Cowardly Dog', 'Ash Ketchum',
      'Shaggy Rogers', 'Stewie Griffin', 'Daffy Duck', 'Optimus Prime', 'Charlie Brown'
    ]
  },
  {
    id: 'animals',
    name: 'Animals',
    emoji: '🦩',
    blurb: 'Easy mode. Great with kids and tipsy adults.',
    accent: '#a3e635',
    characters: [
      'Penguin', 'Elephant', 'Octopus', 'Kangaroo', 'Giraffe',
      'Sloth', 'Great White Shark', 'Chameleon', 'Flamingo', 'Grizzly Bear',
      'Hedgehog', 'Peacock', 'Komodo Dragon', 'Koala', 'Snow Leopard',
      'Hummingbird', 'Blue Whale', 'Meerkat', 'Platypus', 'Tarantula',
      'Red Panda', 'Bald Eagle', 'Jellyfish', 'Camel', 'Orangutan',
      'Narwhal', 'Ostrich', 'Axolotl', 'Rhinoceros', 'Honey Badger'
    ]
  },
  {
    id: 'tvshows',
    name: 'TV Characters',
    emoji: '🍿',
    blurb: 'The people you binge-watched at 2am.',
    accent: '#f472b6',
    characters: [
      'Walter White', 'Michael Scott', 'Eleven', 'Daenerys Targaryen', 'Sheldon Cooper',
      'Tony Soprano', 'Rachel Green', 'Dwight Schrute', 'Jon Snow', 'Ted Lasso',
      'Phoebe Buffay', 'Don Draper', 'Villanelle', 'Sherlock Holmes', 'Joey Tribbiani',
      'Tyrion Lannister', 'Leslie Knope', 'Barney Stinson', 'The Doctor', 'Jesse Pinkman',
      'Ross Geller', 'Gus Fring', 'Fleabag', 'Ron Swanson', 'Chandler Bing',
      'Saul Goodman', 'Buffy Summers', 'Omar Little', 'Monica Geller', 'Hannah Montana'
    ]
  }
];

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Metadata only — the character lists never leave the server before a game starts. */
function publicCategories() {
  return CATEGORIES.map(({ id, name, emoji, blurb, accent, characters }) => ({
    id,
    name,
    emoji,
    blurb,
    accent,
    count: characters.length
  }));
}

function getCategory(id) {
  return CATEGORY_BY_ID.get(id) || null;
}

module.exports = { CATEGORIES, publicCategories, getCategory };
