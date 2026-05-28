const sampleUsers = [
  {
    user_id: "U001",
    name: "Maya",
    role: "Working Mother",
    connected_to: "Aarav",
    age_stage: "Big Kid",
    loop_type: "Parent-child",
    care_steps_week: 8,
    streak: "5 days",
    last_loop: "What made you smile today?",
  },
  {
    user_id: "U002",
    name: "Daniel",
    role: "Working Father",
    connected_to: "Nora",
    age_stage: "Teen",
    loop_type: "Parent-teen",
    care_steps_week: 6,
    streak: "3 days",
    last_loop: "Want advice, space, or listening?",
  },
  {
    user_id: "U003",
    name: "Priya",
    role: "Stay-at-home Mother",
    connected_to: "Ishan",
    age_stage: "Little Kid",
    loop_type: "Parent-child",
    care_steps_week: 11,
    streak: "7 days",
    last_loop: "Draw your favorite part of today.",
  },
  {
    user_id: "U004",
    name: "Elena",
    role: "Working Mother",
    connected_to: "Milo",
    age_stage: "Infant",
    loop_type: "Parent-infant",
    care_steps_week: 5,
    streak: "2 days",
    last_loop: "Save one tiny win from today.",
  },
  {
    user_id: "U005",
    name: "Zoe",
    role: "Sibling",
    connected_to: "Leo",
    age_stage: "Big Kid",
    loop_type: "Sibling loop",
    care_steps_week: 4,
    streak: "4 days",
    last_loop: "Say one kind thing about each other.",
  },
];

const loopCards = [
  {
    stage: "Infant",
    title: "Tiny win",
    prompt: "Capture one sound, smile, or sleepy milestone from today.",
  },
  {
    stage: "Little Kid",
    title: "Bedtime laugh",
    prompt: "What made you laugh today?",
  },
  {
    stage: "Teen",
    title: "Low-pressure check-in",
    prompt: "Want advice, space, or just someone to listen?",
  },
  {
    stage: "Siblings",
    title: "Kindness loop",
    prompt: "Send one kind thing you noticed about each other.",
  },
];

const tableBody = document.querySelector("#userTable");
const loopGrid = document.querySelector("#loopCards");

function renderTable(users) {
  tableBody.innerHTML = users
    .map(
      (user) => `
        <tr>
          <td>${user.user_id}</td>
          <td>${user.name}</td>
          <td>${user.role}</td>
          <td>${user.connected_to}</td>
          <td>${user.age_stage}</td>
          <td>${user.loop_type}</td>
          <td>${user.care_steps_week}</td>
          <td>${user.streak}</td>
          <td>${user.last_loop}</td>
        </tr>
      `,
    )
    .join("");
}

function renderLoopCards(cards) {
  loopGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="loop-card">
          <span class="chip">${card.stage}</span>
          <h4>${card.title}</h4>
          <p>${card.prompt}</p>
        </article>
      `,
    )
    .join("");
}

renderTable(sampleUsers);
renderLoopCards(loopCards);
