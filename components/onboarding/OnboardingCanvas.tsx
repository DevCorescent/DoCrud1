/**
 * Decorative onboarding background: three marquee rows of profile cards over a
 * perspective grid, with floating notes and a vignette.
 *
 * Transferred from the standalone onboarding prototype. Two deliberate changes
 * from the source:
 *
 *  - Every Tailwind utility in the markup became a semantic class in
 *     onboarding.css. globals.css repaints `[class*='bg-white']` inside an
 *     <article> with `!important`, which would have flattened the skill chips.
 *  - It renders no client-side state, so it stays a server component and can
 *     be mounted once by the shell without React re-mounting it per step.
 *
 * The people below are invented decoration. They are not Docrud users,
 * candidates or database records, and nothing here reads or writes real data.
 */
import { BriefcaseBusiness, FileText, MapPin, Star, Users } from 'lucide-react';

type ProfileCard = {
  initials: string;
  name: string;
  role: string;
  location: string;
  skills: string[];
  status: string;
  tone: string;
};

const profileRows: ProfileCard[][] = [
  [
    { initials: 'AK', name: 'Ananya Krishnan', role: 'Product Designer', location: 'Bengaluru', skills: ['Figma', 'Design systems'], status: 'Open to work', tone: 'emerald' },
    { initials: 'RM', name: 'Rohan Mehta', role: 'ML Engineer', location: 'Hyderabad', skills: ['Python', 'LLMs'], status: 'Available now', tone: 'blue' },
    { initials: 'SJ', name: 'Siddharth Joshi', role: 'Full-stack developer', location: 'Pune', skills: ['Next.js', 'Go'], status: 'Freelance', tone: 'violet' },
    { initials: 'PN', name: 'Priya Nair', role: 'UX Writer', location: 'Kochi', skills: ['Content', 'SEO'], status: 'Part-time', tone: 'rose' },
  ],
  [
    { initials: 'VS', name: 'Vikram Singh', role: 'Cloud Architect', location: 'Delhi NCR', skills: ['AWS', 'Kubernetes'], status: 'Contract', tone: 'cyan' },
    { initials: 'MI', name: 'Meera Iyer', role: 'Motion Designer', location: 'Chennai', skills: ['Lottie', 'Brand'], status: 'Open to work', tone: 'fuchsia' },
    { initials: 'AT', name: 'Aryan Thakur', role: 'Data Scientist', location: 'Mumbai', skills: ['R', 'Pandas'], status: 'Available now', tone: 'teal' },
    { initials: 'NK', name: 'Nisha Kapoor', role: 'Legal tech consultant', location: 'Noida', skills: ['LegalOps', 'Docs'], status: 'Freelance', tone: 'indigo' },
  ],
  [
    { initials: 'LM', name: 'Liam Morrison', role: 'Product Manager', location: 'London', skills: ['Roadmaps', 'Agile'], status: 'Open to work', tone: 'sky' },
    { initials: 'SC', name: 'Sofia Chen', role: 'UX Researcher', location: 'Singapore', skills: ['User testing', 'Miro'], status: 'Contract', tone: 'blue' },
    { initials: 'EP', name: 'Elena Petrov', role: 'DevOps Engineer', location: 'Berlin', skills: ['GCP', 'Docker'], status: 'Part-time', tone: 'purple' },
    { initials: 'KY', name: 'Kenji Yamamoto', role: 'iOS Engineer', location: 'Tokyo', skills: ['Swift', 'SwiftUI'], status: 'Open to work', tone: 'green' },
  ],
];

const toneClasses: Record<string, string> = {
  emerald: 'canvas-avatar-emerald',
  blue: 'canvas-avatar-blue',
  violet: 'canvas-avatar-violet',
  rose: 'canvas-avatar-rose',
  cyan: 'canvas-avatar-cyan',
  fuchsia: 'canvas-avatar-fuchsia',
  teal: 'canvas-avatar-teal',
  indigo: 'canvas-avatar-indigo',
  sky: 'canvas-avatar-sky',
  purple: 'canvas-avatar-purple',
  green: 'canvas-avatar-green',
};

function ProfileCardItem({ card }: { card: ProfileCard }) {
  return (
    <article className="canvas-profile-card">
      <div className="canvas-profile-header">
        <div className={`canvas-avatar ${toneClasses[card.tone] ?? ''}`}>{card.initials}</div>
        <div className="canvas-profile-ident">
          <p className="canvas-profile-name">{card.name}</p>
          <p className="canvas-profile-role">{card.role}</p>
        </div>
        <div className="canvas-profile-rating">
          <Star className="canvas-star" aria-hidden="true" /> 4.9
        </div>
      </div>
      <div className="canvas-profile-meta">
        <span className="canvas-profile-location">
          <MapPin className="canvas-pin" aria-hidden="true" /> {card.location}
        </span>
        <span className="canvas-profile-status">{card.status}</span>
      </div>
      <div className="canvas-profile-skills">
        {card.skills.map(skill => (
          <span className="canvas-profile-skill" key={skill}>{skill}</span>
        ))}
      </div>
      <div className="canvas-profile-footer">
        <span>24 projects</span>
        <span className="canvas-profile-connect">Connect →</span>
      </div>
    </article>
  );
}

/**
 * One marquee row. The card list is duplicated so the -50% translate in the
 * keyframes lands exactly on the seam and the loop is invisible.
 */
function CanvasRow({ cards, direction }: { cards: ProfileCard[]; direction: 'forward' | 'reverse' }) {
  return (
    <div className="canvas-row">
      <div className={`canvas-track${direction === 'reverse' ? ' canvas-track-reverse' : ''}`}>
        {[...cards, ...cards].map((card, cardIndex) => (
          <ProfileCardItem card={card} key={`${card.name}-${cardIndex}`} />
        ))}
      </div>
    </div>
  );
}

export default function OnboardingCanvas() {
  return (
    <div className="onboarding-canvas" aria-hidden="true">
      <div className="canvas-grid" />
      <div className="canvas-content">
        <CanvasRow cards={profileRows[0]} direction="forward" />
        <CanvasRow cards={profileRows[1]} direction="reverse" />
        <CanvasRow cards={profileRows[2]} direction="forward" />
        <div className="canvas-floating-note canvas-floating-note-left">
          <BriefcaseBusiness className="canvas-note-jobs" aria-hidden="true" />
          <span>Jobs matched</span>
          <strong>your way</strong>
        </div>
        <div className="canvas-floating-note canvas-floating-note-right">
          <Users className="canvas-note-network" aria-hidden="true" />
          <span>Network signal</span>
          <strong>in motion</strong>
        </div>
        <div className="canvas-floating-note canvas-floating-note-bottom">
          <FileText className="canvas-note-docs" aria-hidden="true" />
          <span>Work, talent, and tools</span>
        </div>
      </div>
      <div className="canvas-vignette" />
    </div>
  );
}
