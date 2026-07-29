'use client';

import { useState, useEffect, useRef } from 'react';

const PLACEHOLDER_IMAGE = '/frebys-logo.png';

export default function PrintInventoryPage() {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sharing, setSharing] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchProducts();
    }, []);

    const handleShareWhatsApp = async () => {
        if (!contentRef.current) return;
        setSharing(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');

            const canvas = await html2canvas(contentRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            const pdfBlob = pdf.output('blob');
            const fileName = `Freby’s-Inventory-${new Date().toISOString().slice(0, 10)}.pdf`;
            const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                await navigator.share({ files: [pdfFile], title: 'Freby’s Fashion GH — Inventory Report' });
            } else {
                // Fallback: download the PDF
                const url = URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
                alert('PDF downloaded! You can now attach it to a WhatsApp message.');
            }
        } catch (err) {
            console.error('Share failed:', err);
            alert('Could not generate PDF. Please use Print Now → Save as PDF instead.');
        } finally {
            setSharing(false);
        }
    };

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/products?sortBy=name', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load products');
            const data = await res.json();
            if (data) {
                // Sort by category then by name
                const sorted = (Array.isArray(data) ? data : []).sort((a, b) => {
                    const catA = a.category || '';
                    const catB = b.category || '';
                    if (catA < catB) return -1;
                    if (catA > catB) return 1;
                    return a.name.localeCompare(b.name);
                });
                setProducts(sorted);
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <p className="text-xl text-gray-600 font-semibold animate-pulse">Loading Inventory...</p>
            </div>
        );
    }

    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const totalValue = products.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.stock) ?? 0), 0);

    return (
        <div className="p-8 max-w-6xl mx-auto bg-white min-h-screen text-black">
            <style dangerouslySetInnerHTML={{
                __html: `
        @media print {
          @page { size: portrait; margin: 0.5in; }
          body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-hidden { display: none !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
      `}} />

            {/* Buttons */}
            <div className="mb-6 print-hidden flex flex-wrap gap-3 items-center">
                <button
                    onClick={() => window.print()}
                    className="px-6 py-2 bg-black text-white rounded shadow hover:bg-gray-800 transition-colors font-semibold flex items-center"
                >
                    <i className="ri-printer-line mr-2"></i>
                    Print Now
                </button>
                <button
                    onClick={handleShareWhatsApp}
                    disabled={sharing}
                    className="px-6 py-2 bg-green-500 text-white rounded shadow hover:bg-green-600 transition-colors font-semibold flex items-center disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    <i className={`${sharing ? 'ri-loader-4-line animate-spin' : 'ri-whatsapp-line'} mr-2`}></i>
                    {sharing ? 'Generating PDF…' : 'Share on WhatsApp'}
                </button>
                <button
                    onClick={() => window.close()}
                    className="px-6 py-2 bg-white text-black border-2 border-black rounded shadow hover:bg-gray-100 transition-colors font-semibold flex items-center"
                >
                    <i className="ri-close-line mr-2"></i>
                    Close Window
                </button>
            </div>

            {/* Printable / shareable content */}
            <div ref={contentRef}>
            <div className="flex items-center justify-between mb-8 border-b-2 border-black pb-4">
                <div>
                    <h1 className="text-3xl font-bold font-['Pacifico']">Freby’s Fashion GH</h1>
                    <h2 className="text-xl mt-1 uppercase tracking-wider font-semibold text-gray-800">Inventory Product List</h2>
                </div>
                <div className="text-right">
                    <p className="font-medium">Date: {currentDate}</p>
                    <p className="font-medium">Total Products: {products.length}</p>
                    <p className="font-bold text-lg mt-1">Total Value: GH₵ {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
            </div>

            <table className="w-full text-left border-collapse border border-gray-300">
                <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-400">
                        <th className="p-3 border border-gray-300 font-bold w-20 text-center">Image</th>
                        <th className="p-3 border border-gray-300 font-bold">Product Name</th>
                        <th className="p-3 border border-gray-300 font-bold w-32">SKU</th>
                        <th className="p-3 border border-gray-300 font-bold w-40">Category</th>
                        <th className="p-3 border border-gray-300 font-bold w-24 text-right">Price</th>
                        <th className="p-3 border border-gray-300 font-bold w-20 text-center">Stock</th>
                        <th className="p-3 border border-gray-300 font-bold w-28 text-right">Value</th>
                        <th className="p-3 border border-gray-300 font-bold w-24 text-center">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map((product, index) => (
                        <tr key={product.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="p-2 border border-gray-300 text-center align-middle">
                                <div className="w-14 h-14 mx-auto bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center bg-white">
                                    <img
                                        src={product.image}
                                        alt={product.name}
                                        className="max-w-full max-h-full object-contain"
                                        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
                                        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                                    />
                                </div>
                            </td>
                            <td className="p-3 border border-gray-300 font-semibold text-sm">{product.name}</td>
                            <td className="p-3 border border-gray-300 text-sm font-mono text-gray-700">{product.sku || '-'}</td>
                            <td className="p-3 border border-gray-300 text-sm">{product.category || '-'}</td>
                            <td className="p-3 border border-gray-300 text-right font-medium whitespace-nowrap">GH₵ {(Number(product.price) || 0).toFixed(2)}</td>
                            <td className="p-3 border border-gray-300 text-center font-bold">{product.stock ?? 0}</td>
                            <td className="p-3 border border-gray-300 text-right font-semibold whitespace-nowrap">GH₵ {((Number(product.price) || 0) * (Number(product.stock) ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="p-3 border border-gray-300 text-center text-xs uppercase font-semibold tracking-wider">{product.status}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="mt-6 p-4 bg-gray-100 border-2 border-gray-400 rounded print:bg-gray-100">
                <p className="text-right font-bold text-lg">Total Inventory Value: GH₵ {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>

            <div className="mt-8 text-center text-sm font-medium border-t-2 border-black pt-4">
                <p>End of Inventory Report &mdash; Generated from Freby’s Fashion GH Admin Panel</p>
            </div>
            </div> {/* end contentRef */}
        </div>
    );
}
