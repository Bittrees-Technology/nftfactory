import Link from 'next/link';

const tools = [
  {title: 'Creator page', href: '/profile/setup'},
  {title: 'Import artwork', href: '/profile/import'},
  {title: 'Artwork tags', href: '/profile/tags'},
  {title: 'Listings', href: '/profile/listings'},
  {title: 'Collection tools', href: '/mint?view=manage&collection=custom'},
  {title: 'Marketplace', href: '/marketplace'}
];

export default function StudioWorkspaceClient() {
  return (
    <nav className="studioToolTabs" aria-label="My studio tools">
      {tools.map(tool => <Link key={tool.href} href={tool.href}>{tool.title}</Link>)}
    </nav>
  );
}
