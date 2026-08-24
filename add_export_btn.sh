sed -i '/<button/c\
        <div className="flex items-center gap-3">\
          <button\
            onClick={handleExportCSV}\
            className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold rounded-2xl text-xs transition-colors shrink-0"\
          >\
            <Download className="w-4 h-4" />\
            <span className="hidden sm:inline">CSV İndir</span>\
          </button>\
          <button' src/components/CustomerManagement.tsx
sed -i '/<span>Yeni Müşteri Ekle<\/span>/!b;n;c\
        </button>\
        </div>' src/components/CustomerManagement.tsx
