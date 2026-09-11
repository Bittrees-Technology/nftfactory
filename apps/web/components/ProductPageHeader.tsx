import type {ReactNode} from 'react';
export default function ProductPageHeader({section,title,description,actions}:{section:string;title:string;description:string;actions?:ReactNode}) {
 return <header className="pageHeading productPageHeader"><div className="productPageIntro"><p className="eyebrow">{section}</p><h1>{title}</h1><p className="productPageDescription">{description}</p></div>{actions&&<div className="productPageActions">{actions}</div>}</header>;
}
