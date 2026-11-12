# CRL images and fabrication files

Photos (`images/`, named by SKU), fabrication drawings (`fabrication/`) and CRL UK brochures (`source-pdfs/`) are split into `crl_assets.tar.partNN` files to fit GitHub's 25 MB upload limit.

Rebuild them from this folder with:

    cat crl_assets.tar.part* | tar -xf -

Each row in `crl_shower_catalogue.csv` names its photo in the `image_file` column and its drawings in `fabrication_files`.
