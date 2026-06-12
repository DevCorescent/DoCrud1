export default function CatalogueLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Force dark background on html/body so overscroll bounce never shows white */}
      <style>{`html,body{background-color:#0D0D0F!important;background-image:none!important}`}</style>
      {children}
    </>
  );
}
