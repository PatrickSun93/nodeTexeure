/**
 * Breadcrumb Navigation Component with SEO optimization
 */
import Link from 'next/link';
import { generateStructuredData } from '../lib/seo';

export default function Breadcrumb({ items, className = '' }) {
  if (!items || items.length === 0) return null;

  const structuredData = generateStructuredData('breadcrumb', items);

  return (
    <>
      {/* Structured Data for Breadcrumbs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData)
        }}
      />
      
      {/* Breadcrumb Navigation */}
      <nav 
        className={`breadcrumb-nav ${className}`}
        aria-label="Breadcrumb navigation"
      >
        <ol className="breadcrumb-list">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            
            return (
              <li key={index} className="breadcrumb-item">
                {isLast ? (
                  <span 
                    className="breadcrumb-current"
                    aria-current="page"
                  >
                    {item.name}
                  </span>
                ) : (
                  <>
                    <Link 
                      href={item.url}
                      className="breadcrumb-link"
                    >
                      {item.name}
                    </Link>
                    <span className="breadcrumb-separator" aria-hidden="true">
                      &gt;
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

/**
 * Breadcrumb styles (to be added to globals.css)
 */
export const breadcrumbStyles = `
.breadcrumb-nav {
  padding: 1rem 0;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
}

.breadcrumb-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.875rem;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
}

.breadcrumb-link {
  color: #6c757d;
  text-decoration: none;
  transition: color 0.2s ease;
}

.breadcrumb-link:hover {
  color: #495057;
  text-decoration: underline;
}

.breadcrumb-current {
  color: #495057;
  font-weight: 500;
}

.breadcrumb-separator {
  margin: 0 0.5rem;
  color: #adb5bd;
}

@media (max-width: 768px) {
  .breadcrumb-nav {
    padding: 0.75rem 0;
  }
  
  .breadcrumb-list {
    font-size: 0.8rem;
  }
  
  .breadcrumb-separator {
    margin: 0 0.25rem;
  }
}
`;